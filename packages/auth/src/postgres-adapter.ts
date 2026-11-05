import { createAdapterFactory, type CustomAdapter, type CleanedWhere, type AdapterFactory } from 'better-auth/adapters';
import type { BetterAuthOptions } from 'better-auth';
import type { Pool, PoolClient } from 'pg';
import { v7 } from 'uuid';
import { credentials } from './crypto.ts';

type Row = Record<string, unknown>;
type Keys = Parameters<typeof credentials>[0];
export type AuditSink = (tx: PoolClient, mutation: { model: string; operation: 'create' | 'consume' | 'revoke' | 'update'; entityId: string }) => Promise<void>;
const unsupported = (): never => { throw new Error('Unsupported hardened auth operation'); };
const text = (value: unknown): string => typeof value === 'string' ? value : unsupported();

// Only the OTP/session subset is exposed. Stock HTTP handlers must remain unmounted.
export function postgresAdapter(pool: Pool, keys: Keys, audit: AuditSink) {
  if (typeof audit !== 'function') throw new Error('Transactional audit sink required');
  const crypto = credentials(keys);
  function build(db: Pool | PoolClient, transaction = false, identifiers = new Map<string, string>()) {
    let options: BetterAuthOptions;
    const tables: Record<string, string> = { user: 'users', session: 'sessions', verification: 'auth_challenges' };
    function subject(identifier: unknown) {
      const match = /^sign-in-otp-(.+)$/.exec(text(identifier));
      return match?.[1] ? crypto.emailHash(match[1]) : unsupported();
    }
    function selector(model: string, where: CleanedWhere[] = []) {
      if (!Object.hasOwn(tables, model) || !where.length) return unsupported();
      const values: unknown[] = [];
      const clauses = where.map((item) => {
        if (item.connector === 'OR') return unsupported();
        const columns: Record<string, string> = model === 'user' ? { id: 'id' } : model === 'session' ? { id: 'id', userId: 'user_id', expiresAt: 'expires_at' } : { id: 'id', expiresAt: 'expires_at' };
        let column = Object.hasOwn(columns, item.field) ? columns[item.field] : undefined; let value: unknown = item.value;
        if (model === 'user' && item.field === 'email') { column = 'email_lookup_hash'; value = crypto.emailHash(text(value)); }
        if (model === 'session' && item.field === 'token') { column = 'token_hash'; value = crypto.tokenHash(text(value)); }
        if (model === 'verification' && item.field === 'identifier') { column = 'email_lookup_hash'; value = subject(value); }
        if (['email', 'token', 'identifier', 'id', 'userId'].includes(item.field) && item.operator !== 'eq') return unsupported();
        const operator = item.operator === 'eq' ? '=' : item.operator === 'gt' ? '>' : item.operator === 'lt' ? '<' : unsupported();
        if (!column) return unsupported();
        if (['id', 'userId'].includes(item.field) && !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))) return unsupported();
        if (item.field === 'expiresAt' && (!(value instanceof Date) || !Number.isFinite(value.getTime()))) return unsupported();
        values.push(value); return `${column} ${operator} $${values.length}`;
      });
      return { clause: clauses.join(' AND '), values };
    }
    function output(model: string, row: Row, where: CleanedWhere[] = []): Row {
      const common = { id: row.id, createdAt: row.created_at, updatedAt: row.updated_at ?? row.created_at };
      if (model === 'user') return { ...common, email: crypto.decrypt(row.email as Buffer), name: row.display_name, emailVerified: true, image: null };
      if (model === 'session') {
        const token = where.find((item) => item.field === 'token')?.value;
        if (typeof token !== 'string') return unsupported(); // A hash is never a bearer credential.
        return { ...common, userId: row.user_id, token, expiresAt: row.expires_at, ipAddress: null, userAgent: row.user_agent_summary };
      }
      const identifier = where.find((item) => item.field === 'identifier')?.value ?? identifiers.get(text(row.id));
      if (typeof identifier !== 'string') return unsupported();
      if (transaction) identifiers.set(text(row.id), identifier);
      return { ...common, identifier, value: `${(row.code_hash as Buffer).toString('base64url')}:${row.attempts}`, expiresAt: row.expires_at };
    }
    async function read(model: string, where: CleanedWhere[], limit = 1) {
      try {
      const { clause, values } = selector(model, where);
      if (transaction && model === 'verification') {
        const identifier = where.find((item) => item.field === 'identifier')?.value;
        if (identifier) await lock(db as PoolClient, subject(identifier));
      }
      const guard = model === 'session'
        ? " AND revoked_at IS NULL AND expires_at > now() AND last_seen_at > now() - interval '7 days'"
        : model === 'verification' ? ' AND consumed_at IS NULL' : " AND status = 'active'";
      if (model === 'session' && !where.some((item) => item.field === 'token')) return unsupported();
      const result = model === 'session'
        ? await db.query<Row>(`WITH live AS MATERIALIZED (SELECT * FROM sessions WHERE ${clause}${guard} AND created_at+interval '30 days'>now()), touched AS (UPDATE sessions SET last_seen_at=now() WHERE ${clause}${guard} AND created_at+interval '30 days'>now() AND last_seen_at<=now()-interval '5 minutes' RETURNING *) SELECT * FROM touched UNION ALL SELECT * FROM live WHERE NOT EXISTS (SELECT 1 FROM touched)`, values)
        : await db.query<Row>(`SELECT * FROM ${tables[model]} WHERE ${clause}${guard} ORDER BY created_at DESC LIMIT ${Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : unsupported()}`, values);
      return result.rows.map((row) => output(model, row, where));
      } catch { throw new Error('Auth persistence rejected'); }
    }
    async function atomic<T>(work: (tx: PoolClient) => Promise<T>): Promise<T> {
      if (transaction) { try { return await work(db as PoolClient); } catch { throw new Error('Auth persistence rejected'); } }
      const tx = await pool.connect();
      try { await tx.query('BEGIN ISOLATION LEVEL READ COMMITTED'); const result = await work(tx); await tx.query('COMMIT'); return result; }
      catch { await tx.query('ROLLBACK'); throw new Error('Auth persistence rejected'); }
      finally { tx.release(); }
    }
    const lock = (tx: PoolClient, hash: Buffer) => tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [hash.toString('hex')]);
    const custom: CustomAdapter = {
      async create({ model, data }) {
        return atomic(async (tx) => {
        let row: Row;
        if (model === 'user') {
          if (data.emailVerified !== true || !text(data.name).length || [...text(data.name)].length > 80) return unsupported();
          const result = await tx.query<Row>('INSERT INTO users (id,email,email_lookup_hash,display_name) VALUES ($1,$2,$3,$4) RETURNING *', [v7(), crypto.encrypt(text(data.email)), crypto.emailHash(text(data.email)), data.name]);
          row = output(model, result.rows[0]!);
        } else if (model === 'session') {
          const token = crypto.token();
          const result = await tx.query<Row>("INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,LEAST($4,now()+interval '30 days')) RETURNING *", [v7(), data.userId, crypto.tokenHash(token), data.expiresAt]);
          row = output(model, result.rows[0]!, [{ field: 'token', value: token, operator: 'eq', connector: 'AND', mode: 'sensitive' }]);
        } else if (model === 'verification') {
          const hash = subject(data.identifier);
          await lock(tx, hash);
          const parts = /^([A-Za-z0-9_-]{43}):([0-5])$/.exec(text(data.value));
          if (!parts?.[1] || !parts[2]) return unsupported();
          const code = Buffer.from(parts[1], 'base64url');
          if (Number(parts[2]) === 0 && (await tx.query('SELECT id FROM auth_challenges WHERE email_lookup_hash=$1 AND code_hash=$2 AND expires_at>now() LIMIT 1', [hash, code])).rows.length) return unsupported();
          // A failed guess restores the same challenge, retaining its original expiry/budget.
          const restored = await tx.query<Row>("UPDATE auth_challenges SET consumed_at=CASE WHEN $3<5 THEN NULL ELSE consumed_at END, attempts=$3 WHERE id=(SELECT id FROM auth_challenges WHERE email_lookup_hash=$1 ORDER BY created_at DESC,id DESC LIMIT 1) AND code_hash=$2 AND consumed_at IS NOT NULL AND attempts+1=$3 AND date_trunc('milliseconds',expires_at)=$4 RETURNING *", [hash, code, Number(parts[2]), data.expiresAt]);
          if (Number(parts[2]) > 0 && !restored.rows.length) return unsupported();
          if (!restored.rows.length) await tx.query('UPDATE auth_challenges SET consumed_at=COALESCE(consumed_at,now()) WHERE email_lookup_hash=$1', [hash]);
          const result = restored.rows.length ? restored : await tx.query<Row>("INSERT INTO auth_challenges (id,email_lookup_hash,code_hash,attempts,expires_at,created_at) VALUES ($1,$2,$3,$4,LEAST($5,now()+interval '10 minutes'),GREATEST(now(),COALESCE((SELECT max(created_at)+interval '1 microsecond' FROM auth_challenges WHERE email_lookup_hash=$2),now()))) RETURNING *", [v7(), hash, code, Number(parts[2]), data.expiresAt]);
          row = output(model, result.rows[0]!, [{ field: 'identifier', value: data.identifier, operator: 'eq', connector: 'AND', mode: 'sensitive' }]);
        } else return unsupported();
        await audit(tx, { model, operation: 'create', entityId: text(row.id) });
        return row as typeof data;
        });
      },
      async findOne<T>({ model, where }: Parameters<CustomAdapter['findOne']>[0]) { return (await read(model, where))[0] as T ?? null; },
      async findMany<T>({ model, where = [], limit }: Parameters<CustomAdapter['findMany']>[0]) { return await read(model, where, limit) as T[]; },
      async consumeOne<T>({ model, where }: Parameters<NonNullable<CustomAdapter['consumeOne']>>[0]) {
        if (model !== 'verification' || where.length !== 1 || where[0]?.field !== 'id' || where[0]?.operator !== 'eq') return unsupported();
        const { clause, values } = selector(model, where);
        return atomic(async (tx) => {
          const result = await tx.query<Row>(`UPDATE auth_challenges SET consumed_at=now() WHERE ${clause} AND consumed_at IS NULL AND attempts<5 AND expires_at>now() RETURNING *`, values);
          if (!result.rows[0]) return null;
          await audit(tx, { model, operation: 'consume', entityId: text(result.rows[0].id) });
          return output(model, result.rows[0], where) as T;
        });
      },
      async deleteMany({ model, where }) {
        const { clause, values } = selector(model, where);
        if (!['verification', 'session'].includes(model)) return unsupported();
        return atomic(async (tx) => {
          const column = model === 'verification' ? 'consumed_at' : 'revoked_at';
          const result = await tx.query<Row>(`UPDATE ${tables[model]} SET ${column}=now() WHERE ${clause} AND ${column} IS NULL RETURNING id`, values);
          for (const row of result.rows) await audit(tx, { model, operation: 'revoke', entityId: text(row.id) });
          return result.rowCount ?? 0;
        });
      },
      async delete(args) { await custom.deleteMany(args); },
      async update<T>({ model, where, update }: Parameters<CustomAdapter['update']>[0]) {
        if (model !== 'user' || !update || typeof update !== 'object') return unsupported();
        const data = update as Row;
        if (Object.keys(data).some((key) => !['email', 'name', 'updatedAt'].includes(key))) return unsupported();
        const { clause, values } = selector(model, where);
        return atomic(async (tx) => {
          const fields = ['updated_at=now()', 'version=version+1'];
          if (data.email !== undefined) {
            values.push(crypto.encrypt(text(data.email)), crypto.emailHash(text(data.email)));
            fields.push(`email=$${values.length - 1}`, `email_lookup_hash=$${values.length}`);
          }
          if (data.name !== undefined) {
            if (![...text(data.name)].length || [...text(data.name)].length > 80) return unsupported();
            values.push(data.name); fields.push(`display_name=$${values.length}`);
          }
          const result = await tx.query<Row>(`UPDATE users SET ${fields.join(',')} WHERE ${clause} RETURNING *`, values);
          if (!result.rows[0]) return null;
          await audit(tx, { model, operation: 'update', entityId: text(result.rows[0].id) });
          return output(model, result.rows[0], where) as T;
        });
      },
      updateMany: async () => unsupported(), count: async () => unsupported(),
    };
    const factory: AdapterFactory<BetterAuthOptions> = createAdapterFactory({
      config: {
        adapterId: 'echoes-hardened-postgres', supportsDates: true, supportsUUIDs: true, supportsJSON: false,
        debugLogs: false,
        transaction: async (callback) => {
          if (transaction) return callback(factory(options));
          const client = await pool.connect();
          try {
            await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
            const value = await callback(build(client, true)(options));
            await client.query('COMMIT'); return value;
          } catch { await client.query('ROLLBACK'); throw new Error('Auth persistence rejected'); }
          finally { client.release(); }
        },
      },
      adapter: () => custom,
    });
    return (config: BetterAuthOptions) => {
      if (config.secondaryStorage || config.session?.cookieCache?.enabled || config.session?.disableSessionRefresh !== true || config.emailAndPassword?.enabled || Object.keys(config.socialProviders ?? {}).length || config.plugins?.some((plugin) => plugin.id !== 'email-otp')) return unsupported();
      options = config; return factory(config);
    };
  }
  return build(pool);
}
