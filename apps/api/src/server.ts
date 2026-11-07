import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import csrfProtection from '@fastify/csrf-protection';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { hasZodFastifySchemaValidationErrors, jsonSchemaTransform, serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { assertCan, AuthorizationError, type Actor, type StoryResourceContext } from '@echoes-of-home/auth/policy';
import { createStructuredLogger, startObservability } from '@echoes-of-home/observability';
import { LocalAuthService, type AuthService, type Session } from './auth-service.ts';
import { createDrizzleM2FoundationService, M2FoundationService } from './m2-foundation.ts';
import { Pool } from 'pg';

const challengeSchema = z.object({ email: z.string().email().max(320), uiLanguage: z.enum(['xh', 'en']).default('xh') }).strict();
const verifySchema = z.object({ email: z.string().email().max(320), otp: z.string().regex(/^\d{6}$/) }).strict();
const sessionIdParamsSchema = z.object({ id: z.string().min(1).max(128) }).strict();
const correlationPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const familySchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const personSchema = z.object({ displayName: z.string().trim().min(1).max(80), preferredLanguage: z.enum(['xh', 'en']).default('xh') }).strict();
const storySchema = z.object({ familyCircleId: z.string().uuid(), storytellerPersonId: z.string().uuid(), title: z.string().trim().max(200).optional() }).strict();
const invitationSchema = z.object({ type: z.enum(['family_member', 'custodian', 'storyteller_account_link']), invitedEmail: z.string().email().max(320), familyCircleId: z.string().uuid().optional(), storyId: z.string().uuid().optional(), personId: z.string().uuid().optional() }).strict();
const consentSchema = z.object({ method: z.enum(['self_digital', 'assisted_verbal']), evidenceMediaAssetId: z.string().uuid().nullable().default(null), comprehensionResult: z.object({ questions: z.literal(3), correct: z.number().int().min(0).max(3), reexplained: z.boolean() }).strict(), rightsHolderChoice: z.enum(['self', 'custodian']), scopes: z.record(z.string(), z.boolean()) }).strict();
const custodianSchema = z.object({ custodianEmail: z.string().email().max(320), custodianPersonId: z.string().uuid(), consentRecordId: z.string().uuid() }).strict();
const storyRoleSchema = z.object({ userId: z.string().min(1), role: z.enum(['recorder', 'transcript_reviewer', 'translation_reviewer', 'viewer']) }).strict();
const baseResource: StoryResourceContext = { storytellerUserId: null, rightsHolderUserId: null, recorderUserId: null, actorStoryRoles: [], actorCircleRole: 'none', storyStatus: 'draft', deletionRequesterUserId: null, audience: 'private', hasApprovedVersion: false, translationApproved: false, activeConsentScopes: new Set(), hasValidBreakGlassGrant: false, assistedConsentSessionOpen: false, custodianAssistedConfirmationCurrent: false, firstStoryVersionApproved: false, adminReadOnlyProjection: true, adminDeletionApproved: false };

type RequestWithState = FastifyRequest & { session?: Session | null; correlationId?: string };
const actorFor = (session: Session): Actor => ({ userId: session.userId, accountRole: 'member', status: 'active', secondFactorVerified: false });
const resourceFor = (session: Session): StoryResourceContext => ({ ...baseResource, storytellerUserId: session.userId, rightsHolderUserId: session.userId });

function problem(reply: FastifyReply, status: number, code: string, correlationId: string, errors: unknown[] = []): FastifyReply {
  return reply.code(status).type('application/problem+json').send({ type: `https://errors.echoes-of-home.example/${code.replaceAll('_', '-')}`, title: code, status, code, detail: status >= 500 ? 'An internal error occurred.' : code, correlationId, errors });
}

function requireSession(request: RequestWithState, reply: FastifyReply): Session | null {
  if (!request.session) { problem(reply, 401, 'unauthenticated', request.correlationId ?? 'unknown'); return null; }
  return request.session;
}

function assertRoutePolicy(session: Session, action: Parameters<typeof assertCan>[1]): void { assertCan(actorFor(session), action, resourceFor(session)); }

export function buildServer(options: { auth?: AuthService; allowedOrigins?: readonly string[]; foundation?: M2FoundationService } = {}): FastifyInstance {
  const auth = options.auth ?? new LocalAuthService();
  const foundation = options.foundation ?? new M2FoundationService();
  const logger = createStructuredLogger('api');
  const allowedOrigins = new Set(options.allowedOrigins ?? ['http://localhost:3000']);
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Echoes of Home API', version: '1.0.0' },
    },
    transform: jsonSchemaTransform,
  });
  const api = app.withTypeProvider<ZodTypeProvider>();
  app.decorateRequest('session', null);
  app.decorateRequest('correlationId', '');
  app.register(cookie);
  app.register(csrfProtection, { cookieOpts: { signed: false, sameSite: 'lax', httpOnly: true } });
  app.register(helmet, { global: true });
  app.register(rateLimit, { max: 100, timeWindow: '1 minute', errorResponseBuilder: (_request, context) => ({ code: 'rate_limited', retryAfter: context.after }) });
  app.addHook('onRequest', async (request: RequestWithState, reply) => {
    const supplied = request.headers['x-correlation-id'];
    request.correlationId = typeof supplied === 'string' && correlationPattern.test(supplied) ? supplied : randomUUID();
    reply.header('x-correlation-id', request.correlationId);
    const token = request.cookies.eoh_session ?? request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('eoh_session='))?.slice('eoh_session='.length);
    if (token) request.session = await auth.getSession(token);
  });
  app.addHook('preHandler', async (request: RequestWithState, reply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) || request.url.startsWith('/v1/auth/challenges')) return;
    const session = request.session;
    if (!session) { problem(reply, 401, 'unauthenticated', request.correlationId ?? 'unknown'); return reply; }
    const origin = request.headers.origin;
    if (typeof origin !== 'string' || !allowedOrigins.has(origin) || request.headers['x-requested-with'] !== 'eoh-web') return problem(reply, 403, 'forbidden', request.correlationId ?? 'unknown');
  });
  app.setErrorHandler((error, request, reply) => {
    const correlationId = (request as RequestWithState).correlationId ?? 'unknown';
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
    if (statusCode === 429) return problem(reply, 429, 'rate_limited', correlationId);
    if (error instanceof AuthorizationError) return problem(reply, 403, 'forbidden', correlationId);
    if (hasZodFastifySchemaValidationErrors(error)) return problem(reply, 400, 'validation_failed', correlationId, error.validation.map((issue) => ({ path: issue.instancePath, code: issue.keyword })));
    if (error instanceof z.ZodError) return problem(reply, 400, 'validation_failed', correlationId, error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })));
    const message = error instanceof Error ? error.message : '';
    if (message === 'unauthenticated') return problem(reply, 401, 'unauthenticated', correlationId);
    if (message === 'validation_failed') return problem(reply, 400, 'validation_failed', correlationId);
    if (message === 'not_found') return problem(reply, 404, 'not_found', correlationId);
    if (message === 'placeholder_consent_script_forbidden') return problem(reply, 409, 'placeholder_consent_script_forbidden', correlationId);
    if (message === 'authorization_denied') return problem(reply, 403, 'forbidden', correlationId);
    logger.error('request.failed', { correlationId, route: request.url.split('?')[0], status: 500, errorCode: 'internal_error' });
    return problem(reply, 500, 'internal_error', correlationId);
  });

  // Explicit exemption: these endpoints are intentionally public by API contract.
  // They perform input validation and rate limiting, but have no actor to authorize.
  app.after(() => {
  api.post('/v1/auth/challenges', { schema: { body: challengeSchema }, config: { authorization: 'intentionally-public', rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => { const body = challengeSchema.parse(request.body); return reply.code(202).send(await auth.requestOtp(body.email, body.uiLanguage)); });
  api.post('/v1/auth/challenges/verify', { schema: { body: verifySchema }, config: { authorization: 'intentionally-public', rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => { const body = verifySchema.parse(request.body); const result = await auth.verifyOtp(body.email, body.otp); reply.setCookie('eoh_session', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 30 * 86_400 }); return reply.send({ user: { id: result.session.userId, email: result.session.email }, session: { id: result.session.id, expiresAt: result.session.expiresAt.toISOString() } }); });
  api.post('/v1/auth/logout', async (request, reply) => { const session = requireSession(request, reply); if (!session) return; assertRoutePolicy(session, 'story.read'); await auth.revokeSession(session.userId, session.id); reply.clearCookie('eoh_session', { path: '/' }); return reply.code(204).send(); });
  api.get('/v1/me', async (request, reply) => { const session = requireSession(request, reply); if (!session) return; assertRoutePolicy(session, 'story.read'); return reply.send({ id: session.userId, email: session.email }); });
  api.get('/v1/me/sessions', async (request, reply) => { const session = requireSession(request, reply); if (!session) return; assertRoutePolicy(session, 'story.read'); return reply.send({ data: await auth.listSessions(session.userId), nextCursor: null }); });
  api.delete('/v1/me/sessions/:id', { schema: { params: sessionIdParamsSchema } }, async (request, reply) => { const session = requireSession(request, reply); if (!session) return; assertRoutePolicy(session, 'story.read'); const id = (request.params as { id: string }).id; await auth.revokeSession(session.userId, id); return reply.code(204).send(); });
  api.post('/v1/me/sessions/revoke-all', async (request, reply) => { const session = requireSession(request, reply); if (!session) return; assertRoutePolicy(session, 'story.read'); await auth.revokeAll(session.userId); reply.clearCookie('eoh_session', { path: '/' }); return reply.code(204).send(); });
  type M2ResourceOverrides = Partial<StoryResourceContext> & { storyId?: string; familyCircleId?: string };
  const m2Resource = async (session: Session, overrides: M2ResourceOverrides = {}) => {
    const storyId = (overrides as Partial<{ storyId: string }>).storyId;
    const familyCircleId = (overrides as Partial<{ familyCircleId: string }>).familyCircleId;
    const storyContext = storyId ? await foundation.storyResource(session.userId, storyId) : {};
    return { ...resourceFor(session), storytellerUserId: null, rightsHolderUserId: null, recorderUserId: null, actorCircleRole: familyCircleId ? await foundation.circleRole(session.userId, familyCircleId) : 'none' as const, ...storyContext, ...overrides };
  };
  api.post('/v1/families', { schema: { body: familySchema } }, async (request, reply) => { const session = requireSession(request, reply); if (!session) return; assertCan(actorFor(session), 'family.create', await m2Resource(session)); const family = await foundation.createFamily(session.userId, familySchema.parse(request.body).name); return reply.code(201).send(family); });
  api.get('/v1/families', async (request, reply) => { const session = requireSession(request, reply); if (!session) return; const families = await foundation.listFamilies(session.userId); assertCan(actorFor(session), 'family.read', await m2Resource(session, { familyCircleId: families[0]?.id })); return reply.send({ data: families }); });
  api.post('/v1/persons', { schema: { body: personSchema } }, async (request, reply) => { const session = requireSession(request, reply); if (!session) return; assertCan(actorFor(session), 'person.create', await m2Resource(session, { personCreatorUserId: session.userId })); return reply.code(201).send(await foundation.createPerson(session.userId, personSchema.parse(request.body))); });
  api.post('/v1/stories', { schema: { body: storySchema } }, async (request, reply) => { const session = requireSession(request, reply); if (!session) return; const body = storySchema.parse(request.body); assertCan(actorFor(session), 'story.create', await m2Resource(session, { familyCircleId: body.familyCircleId, recorderUserId: session.userId })); return reply.code(201).send(await foundation.createStory(session.userId, body)); });
  api.get('/v1/stories/:id', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => { const session = requireSession(request, reply); if (!session) return; const { id } = request.params as { id: string }; const story = await foundation.getStory(id); if (!story) throw new Error('not_found'); assertCan(actorFor(session), 'story.read', await m2Resource(session, { storyId: id })); return reply.send(story); });
  api.post('/v1/invitations', { schema: { body: invitationSchema } }, async (request, reply) => { const session = requireSession(request, reply); if (!session) return; const body = invitationSchema.parse(request.body); assertCan(actorFor(session), 'family.invite', await m2Resource(session, { familyCircleId: body.familyCircleId })); return reply.code(201).send(await foundation.invite(session.userId, body)); });
  api.post('/v1/stories/:id/custodian-designation', { schema: { params: z.object({ id: z.string().uuid() }), body: custodianSchema } }, async (request, reply) => { const session = requireSession(request, reply); if (!session) return; const { id } = request.params as { id: string }; const body = custodianSchema.parse(request.body); if (!await foundation.hasConsent(body.consentRecordId)) throw new Error('not_found'); assertCan(actorFor(session), 'custodian.designate', await m2Resource(session, { storyId: id })); return reply.code(201).send(await foundation.invite(session.userId, { type: 'custodian', invitedEmail: body.custodianEmail, storyId: id, personId: body.custodianPersonId })); });
  api.post('/v1/invitations/:id/accept', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => { const session = requireSession(request, reply); if (!session) return; const { id } = request.params as { id: string }; const invitation = await foundation.getInvitation(id); if (!invitation) throw new Error('not_found'); assertCan(actorFor(session), 'invitation.accept', await m2Resource(session, { invitationRecipientUserId: session.userId })); return reply.send(await foundation.acceptInvitation(id, session.userId)); });
  api.post('/v1/stories/:id/consent', { schema: { params: z.object({ id: z.string().uuid() }), body: consentSchema } }, async (request, reply) => { const session = requireSession(request, reply); if (!session) return; const { id } = request.params as { id: string }; const body = consentSchema.parse(request.body); assertCan(actorFor(session), 'consent.create', await m2Resource(session, { storyId: id, assistedConsentSessionOpen: body.method === 'assisted_verbal' })); return reply.code(201).send(await foundation.recordConsent(id, body, session.userId)); });
  api.post('/v1/stories/:id/consent/withdraw', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (request, reply) => { const session = requireSession(request, reply); if (!session) return; const { id } = request.params as { id: string }; assertCan(actorFor(session), 'consent.withdraw', await m2Resource(session, { storyId: id })); return reply.send(await foundation.withdrawConsent(id, session.userId)); });
  api.post('/v1/stories/:id/roles', { schema: { params: z.object({ id: z.string().uuid() }), body: storyRoleSchema } }, async (request, reply) => { const session = requireSession(request, reply); if (!session) return; const { id } = request.params as { id: string }; if (!await foundation.getStory(id)) throw new Error('not_found'); assertCan(actorFor(session), 'story.role.manage', await m2Resource(session, { storyId: id })); const body = storyRoleSchema.parse(request.body); return reply.code(201).send(await foundation.grantRole(id, body.userId, body.role, session.userId)); });
  api.get('/healthz', { config: { authorization: 'intentionally-public' } }, async (_request, reply) => reply.send({ ok: true }));
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const telemetry = await startObservability({ serviceName: 'api' });
  const dbPool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
  const auditKey = process.env.AUDIT_HMAC_KEY ? Buffer.from(process.env.AUDIT_HMAC_KEY, 'base64') : null;
  let fieldKey: Buffer | null = null;
  try { const keyring = process.env.FIELD_ENCRYPTION_KEYS ? JSON.parse(process.env.FIELD_ENCRYPTION_KEYS) as Record<string, string> : null; const currentId = process.env.FIELD_ENCRYPTION_KEY_CURRENT_ID; const encoded = currentId && keyring ? keyring[currentId] : undefined; if (encoded) fieldKey = Buffer.from(encoded, 'base64'); } catch { fieldKey = null; }
  if (process.env.NODE_ENV === 'production' && (!dbPool || !auditKey || auditKey.length < 32 || !fieldKey || fieldKey.length !== 32)) throw new Error('Production M2 persistence requires DATABASE_URL, a 32-byte AUDIT_HMAC_KEY, and the configured 32-byte FIELD_ENCRYPTION_KEYS key');
  const foundation = dbPool && auditKey && fieldKey ? createDrizzleM2FoundationService({ pool: dbPool, auditKey, fieldKey }) : undefined;
  const app = buildServer({ foundation });
  const shutdown = async (): Promise<void> => {
    await app.close();
    await dbPool?.end();
    await telemetry.shutdown();
    process.exit(0);
  };
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
  app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' })
    .then(() => createStructuredLogger('api').info('api.started', { service: 'api', success: true }))
    .catch(() => { process.exitCode = 1; void telemetry.shutdown(); });
}
