import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import csrfProtection from '@fastify/csrf-protection';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { assertCan, AuthorizationError, type Actor, type StoryResourceContext } from '@echoes-of-home/auth/policy';
import { LocalAuthService, type AuthService, type Session } from './auth-service.ts';

const challengeSchema = z.object({ email: z.string().email().max(320), uiLanguage: z.enum(['xh', 'en']).default('xh') }).strict();
const verifySchema = z.object({ email: z.string().email().max(320), otp: z.string().regex(/^\d{6}$/) }).strict();
const correlationPattern = /^[A-Za-z0-9._:-]{1,128}$/;
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

export function buildServer(options: { auth?: AuthService; allowedOrigins?: readonly string[] } = {}): FastifyInstance {
  const auth = options.auth ?? new LocalAuthService();
  const allowedOrigins = new Set(options.allowedOrigins ?? ['http://localhost:3000']);
  const app = Fastify({ logger: false });
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
    const token = request.cookies.eoh_session;
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
    if (error instanceof z.ZodError) return problem(reply, 400, 'validation_failed', correlationId, error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })));
    const message = error instanceof Error ? error.message : '';
    if (message === 'unauthenticated') return problem(reply, 401, 'unauthenticated', correlationId);
    if (message === 'validation_failed') return problem(reply, 400, 'validation_failed', correlationId);
    request.log.error({ err: error, correlationId }, 'request failed');
    return problem(reply, 500, 'internal_error', correlationId);
  });

  // Explicit exemption: these endpoints are intentionally public by API contract.
  // They perform input validation and rate limiting, but have no actor to authorize.
  app.post('/v1/auth/challenges', { config: { authorization: 'intentionally-public', rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => { const body = challengeSchema.parse(request.body); return reply.code(202).send(await auth.requestOtp(body.email, body.uiLanguage)); });
  app.post('/v1/auth/challenges/verify', { config: { authorization: 'intentionally-public', rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => { const body = verifySchema.parse(request.body); const result = await auth.verifyOtp(body.email, body.otp); reply.setCookie('eoh_session', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 30 * 86_400 }); return reply.send({ user: { id: result.session.userId, email: result.session.email }, session: { id: result.session.id, expiresAt: result.session.expiresAt.toISOString() } }); });
  app.post('/v1/auth/logout', async (request, reply) => { const session = requireSession(request, reply); if (!session) return; assertRoutePolicy(session, 'story.read'); await auth.revokeSession(session.userId, session.id); reply.clearCookie('eoh_session', { path: '/' }); return reply.code(204).send(); });
  app.get('/v1/me', async (request, reply) => { const session = requireSession(request, reply); if (!session) return; assertRoutePolicy(session, 'story.read'); return reply.send({ id: session.userId, email: session.email }); });
  app.get('/v1/me/sessions', async (request, reply) => { const session = requireSession(request, reply); if (!session) return; assertRoutePolicy(session, 'story.read'); return reply.send({ data: await auth.listSessions(session.userId), nextCursor: null }); });
  app.delete('/v1/me/sessions/:id', async (request, reply) => { const session = requireSession(request, reply); if (!session) return; assertRoutePolicy(session, 'story.read'); const id = (request.params as { id: string }).id; await auth.revokeSession(session.userId, id); return reply.code(204).send(); });
  app.post('/v1/me/sessions/revoke-all', async (request, reply) => { const session = requireSession(request, reply); if (!session) return; assertRoutePolicy(session, 'story.read'); await auth.revokeAll(session.userId); reply.clearCookie('eoh_session', { path: '/' }); return reply.code(204).send(); });
  app.get('/healthz', { config: { authorization: 'intentionally-public' } }, async (_request, reply) => reply.send({ ok: true }));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) buildServer().listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' }).catch(() => process.exitCode = 1);
