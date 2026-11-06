import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scope = '@echoes-of-home/';
// Workspace import rules follow docs/ARCHITECTURE.md section 4.
const allowed = {
  web: ['shared-types', 'validation'],
  api: ['shared-types', 'validation', 'auth', 'database', 'media-storage', 'agent-workflows'],
  'story-processing': ['shared-types', 'validation', 'auth', 'database', 'media-storage', 'ai-providers', 'agent-workflows'],
  'shared-types': [],
  validation: ['shared-types'],
  auth: ['shared-types', 'validation', 'database'],
  database: ['shared-types', 'validation', 'auth'],
  'ai-providers': ['shared-types', 'validation'],
  'media-storage': ['shared-types', 'validation'],
  'agent-workflows': ['shared-types', 'validation', 'ai-providers'],
};
const owner = (file) => /^(?:apps|packages|workers)\/([^/]+)(?:\/|$)/.exec(file)?.[1];
// New external dependencies require an explicit boundary review in their slice.
const external = {
  validation: ['zod'],
  auth: ['better-auth', 'pg', 'uuid'],
  database: ['@testcontainers/postgresql', 'drizzle-orm', 'drizzle-kit', 'pg'],
  api: ['fastify', '@fastify/cookie', '@fastify/csrf-protection', '@fastify/helmet', '@fastify/rate-limit', 'zod', 'pg', 'better-auth'],
  web: ['next', 'react', 'react-dom'],
};
const providers = /^(openai|cloudinary|@google-cloud\/[^/]+|@anthropic-ai\/[^/]+|@nebius\/[^/]+|@huggingface\/[^/]+|replicate|@aws-sdk\/[^/]+)(\/|$)/;

export default {
  meta: { type: 'problem', schema: [], messages: { forbidden: '{{reason}}' } },
  create(context) {
    const file = path.relative(root, context.filename).split(path.sep).join('/');
    const from = owner(file);
    if (!from) return {};
    const deny = (node, reason) => context.report({ node, messageId: 'forbidden', data: { reason } });
    function check(node, source) {
      const specifier = source?.value;
      if (typeof specifier !== 'string') return deny(node, 'Imports must use a literal path so boundaries can be checked.');
      const resolved = specifier.startsWith('.')
        ? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
        : specifier.replace(/^\//, '');
      const to = specifier.startsWith(scope) ? specifier.slice(scope.length).split('/')[0] : owner(resolved);
      if (/(^|\/)spikes(\/|$)/.test(resolved)) return deny(node, 'M0 spikes must never be imported.');
      if (specifier.startsWith('.') && !resolved.startsWith(file.split('/').slice(0, 2).join('/') + '/')) return deny(node, 'Relative imports must stay inside their workspace.');
      if (to && to !== from && !allowed[from]?.includes(to)) return deny(node, `${from} cannot import ${to}.`);
      if (to && to !== from && !specifier.startsWith(scope)) return deny(node, 'Cross-package imports must use the workspace package name.');
      if (specifier.startsWith('#') || specifier.startsWith('@/') || specifier.startsWith('file:')) return deny(node, 'Unregistered import aliases are forbidden.');
      if (path.isAbsolute(specifier)) return deny(node, 'Absolute filesystem imports are forbidden.');
      if (specifier === 'node:module' || specifier === 'module') return deny(node, 'Module loaders bypass static import boundaries.');
      if (providers.test(specifier)) {
        const media = specifier === 'cloudinary' || specifier.startsWith('cloudinary/');
        const adapter = media ? 'media-storage' : 'ai-providers';
        if (from !== adapter || !file.startsWith(`packages/${adapter}/src/adapters/`)) return deny(node, `Provider SDKs belong in ${adapter}/src/adapters/.`);
      }
      if (!to && !specifier.startsWith('.')) {
        const builtin = specifier.startsWith('node:') && !['web', 'shared-types', 'validation', 'agent-workflows'].includes(from);
        const adapter = ['ai-providers', 'media-storage'].includes(from) && file.startsWith(`packages/${from}/src/adapters/`);
        if (!builtin && !adapter && !external[from]?.some((pkg) => specifier === pkg || specifier.startsWith(pkg + '/'))) return deny(node, `External import ${specifier} requires a boundary review for ${from}.`);
      }
      if (from === 'shared-types' && !to && !specifier.startsWith('.')) return deny(node, 'shared-types must remain dependency-free.');
      if (from === 'agent-workflows' && /^(node:|https?:|pg$|postgres$|drizzle-orm|undici|axios)/.test(specifier)) return deny(node, 'Workflows receive data and providers; no persistence, media, or network clients.');
      if (from === 'database' && /^(fastify|next|express|hono)(\/|$)/.test(specifier)) return deny(node, 'Database must not import HTTP frameworks.');
    }
    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => { if (node.source) check(node, node.source); },
      ExportAllDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
      TSImportType: (node) => check(node, node.argument),
      TSExternalModuleReference: (node) => check(node, node.expression),
      CallExpression: (node) => {
        const member = node.callee.type === 'MemberExpression';
        const method = member ? (node.callee.computed ? node.callee.property.value : node.callee.property.name) : node.callee.name;
        if (method === 'require') check(node, node.arguments[0]);
        if (from === 'agent-workflows' && method === 'fetch') deny(node, 'Inject providers; workflows must not fetch directly.');
      },
      'FunctionDeclaration, VariableDeclarator': (node) => {
        if (from !== 'auth' && ['can', 'assertCan'].includes(node.id?.name)) deny(node, 'Authorisation policy entry points belong only in packages/auth.');
      },
    };
  },
};
