import { randomInt, randomBytes } from 'node:crypto';
import type { createAuthAuditSink } from '@echoes-of-home/database/audit-chain';
import type { postgresAdapter } from '@echoes-of-home/auth/postgres-adapter';
import type { Pool } from 'pg';

export type Session = { id: string; userId: string; email: string; expiresAt: Date };
export type OtpDelivery = { challengeId: string; expiresInSeconds: number };
export type AuthService = {
  requestOtp(email: string, uiLanguage: 'xh' | 'en'): Promise<OtpDelivery>;
  verifyOtp(email: string, otp: string): Promise<{ token: string; session: Session }>;
  getSession(token: string): Promise<Session | null>;
  listSessions(userId: string): Promise<Session[]>;
  revokeSession(userId: string, sessionId: string): Promise<void>;
  revokeAll(userId: string): Promise<void>;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normaliseEmail = (email: string) => email.trim().toLowerCase();

export class LocalAuthService implements AuthService {
  private readonly users = new Map<string, { id: string; email: string }>();
  private readonly challenges = new Map<string, { email: string; otp: string; expiresAt: number; attempts: number }>();
  private readonly sessions = new Map<string, Session & { token: string }>();
  public readonly delivered = new Map<string, string>();

  async requestOtp(email: string, _uiLanguage: 'xh' | 'en'): Promise<OtpDelivery> {
    const address = normaliseEmail(email);
    if (!emailPattern.test(address)) throw new Error('validation_failed');
    const challengeId = randomBytes(16).toString('hex');
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.challenges.set(challengeId, { email: address, otp, expiresAt: Date.now() + 600_000, attempts: 0 });
    this.delivered.set(address, otp);
    return { challengeId, expiresInSeconds: 600 };
  }

  async verifyOtp(email: string, otp: string): Promise<{ token: string; session: Session }> {
    const address = normaliseEmail(email);
    const challenge = [...this.challenges.values()].reverse().find((item) => item.email === address && item.expiresAt > Date.now());
    if (!challenge || !/^\d{6}$/.test(otp)) throw new Error('unauthenticated');
    challenge.attempts += 1;
    if (challenge.attempts > 5 || challenge.otp !== otp) throw new Error('unauthenticated');
    let user = this.users.get(address);
    if (!user) { user = { id: randomBytes(16).toString('hex'), email: address }; this.users.set(address, user); }
    const token = randomBytes(32).toString('base64url');
    const session: Session = { id: randomBytes(16).toString('hex'), userId: user.id, email: user.email, expiresAt: new Date(Date.now() + 30 * 86_400_000) };
    this.sessions.set(token, { ...session, token });
    return { token, session };
  }

  async getSession(token: string): Promise<Session | null> {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    return { id: session.id, userId: session.userId, email: session.email, expiresAt: session.expiresAt };
  }

  async listSessions(userId: string): Promise<Session[]> {
    return [...this.sessions.values()].filter((session) => session.userId === userId && session.expiresAt.getTime() > Date.now()).map(({ token: _token, ...session }) => session);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    for (const [token, session] of this.sessions) if (session.userId === userId && session.id === sessionId) this.sessions.delete(token);
  }

  async revokeAll(userId: string): Promise<void> {
    for (const [token, session] of this.sessions) if (session.userId === userId) this.sessions.delete(token);
  }
}

/** Production Better Auth wiring. HTTP routes depend only on AuthService. */
export async function createBetterAuthService(options: { pool: Pool; authKeys: Parameters<typeof postgresAdapter>[1]; audit: Parameters<typeof createAuthAuditSink>[0]; onOtp?: (mail: { email: string; otp: string }) => void }): Promise<AuthService> {
  const [{ createAuthAuditSink }, { postgresAdapter }, { credentials }, { betterAuth }, { emailOTP }] = await Promise.all([
    import('@echoes-of-home/database/audit-chain'),
    import('@echoes-of-home/auth/postgres-adapter'),
    import('@echoes-of-home/auth/credentials'),
    import('better-auth'),
    import('better-auth/plugins'),
  ]);
  let delivered: { email: string; otp: string } | null = null;
  const crypto = credentials(options.authKeys);
  const adapter = postgresAdapter(options.pool, options.authKeys, createAuthAuditSink(options.audit));
  const auth = betterAuth({
    database: adapter,
    baseURL: 'http://localhost:4000',
    secret: randomBytes(48).toString('base64url'),
    telemetry: { enabled: false },
    logger: { disabled: true },
    session: { disableSessionRefresh: true, cookieCache: { enabled: false } },
    plugins: [emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: { hash: async (otp: string) => crypto.otpHash(otp) },
      sendVerificationOTP: async (mail: { email: string; otp: string }) => { delivered = { email: mail.email, otp: mail.otp }; options.onOtp?.(mail); },
    })],
  });
  return {
    async requestOtp(email, _uiLanguage) { await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } }); return { challengeId: randomBytes(16).toString('hex'), expiresInSeconds: 600 }; },
    async verifyOtp(email, otp) {
      const result = await auth.api.signInEmailOTP({ body: { email, otp, name: 'Echoes of Home' }, returnHeaders: true });
      const token = result.response.token;
      if (typeof token !== 'string' || !token) throw new Error('unauthenticated');
      const authCookie = result.headers.getSetCookie().find((value: string) => value.startsWith('better-auth.session_token='));
      if (!authCookie) throw new Error('unauthenticated');
      const authCookieValue = authCookie.slice('better-auth.session_token='.length).split(';', 1)[0] ?? '';
      const current = await auth.api.getSession({ headers: new Headers({ cookie: `better-auth.session_token=${authCookieValue}` }) });
      if (!current) throw new Error('unauthenticated');
      return { token, session: { id: current.session.id, userId: current.user.id, email: current.user.email, expiresAt: new Date(current.session.expiresAt) } };
    },
    async getSession(token) {
      const result = await options.pool.query<{ id: string; user_id: string; email: Buffer; expires_at: Date }>("SELECT s.id,s.user_id,u.email,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.last_seen_at>now()-interval '7 days' AND s.created_at+interval '30 days'>now() AND u.status='active'", [crypto.tokenHash(token)]);
      const row = result.rows[0];
      return row ? { id: row.id, userId: row.user_id, email: crypto.decrypt(row.email), expiresAt: row.expires_at } : null;
    },
    async listSessions(userId) { const result = await options.pool.query<{ id: string; expires_at: Date }>('SELECT id, expires_at FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC', [userId]); return result.rows.map((row) => ({ id: row.id, userId, email: delivered?.email ?? '', expiresAt: row.expires_at })); },
    async revokeSession(userId, sessionId) { await options.pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id=$2', [userId, sessionId]); },
    async revokeAll(userId) { await options.pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]); },
  };
}
