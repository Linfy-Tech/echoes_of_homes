import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const cases = [
  ['apps/web/src/probe.ts', "import type { X } from '@echoes-of-home/database';"],
  ['apps/web/src/probe.tsx', "export * from '@echoes-of-home/auth/internal';"],
  ['apps/web/src/probe.ts', "import '../../../packages/database/src/private.js';"],
  ['apps/web/src/probe.ts', "export * from '../../../tooling/bridge.js';"],
  ['apps/web/src/probe.ts', "import '@ai-sdk/openai';"],
  ['apps/web/src/probe.cjs', "module.require('@echoes-of-home/database');"],
  ['apps/api/src/probe.ts', "import '@google/genai';"],
  ['packages/agent-workflows/src/probe.ts', "const db = require('@echoes-of-home/database');"],
  ['packages/agent-workflows/src/probe.ts', "await import('@echoes-of-home/media-storage');"],
  ['apps/api/src/probe.ts', "import OpenAI from 'openai';"],
  ['packages/ai-providers/src/probe.ts', "import OpenAI from 'openai';"],
  ['packages/ai-providers/src/adapters/probe.ts', "import cloudinary from 'cloudinary';"],
  ['packages/media-storage/src/adapters/probe.ts', "import OpenAI from 'openai';"],
  ['packages/database/src/probe.ts', "import 'fastify';"],
  ['packages/shared-types/src/probe.ts', "import 'zod';"],
  ['apps/api/src/probe.ts', "import '../../../spikes/queue/queue-atomicity.test.js';"],
  ['apps/api/src/probe.ts', 'const can = () => true;'],
  ['apps/web/src/probe.ts', 'await import(userPath);'],
  ['apps/web/src/probe.ts', "type X = import('@echoes-of-home/database').X;"],
  ['apps/api/src/probe.ts', "import db = require('@echoes-of-home/ai-providers');"],
  ['packages/agent-workflows/src/probe.ts', "fetch('https://example.invalid');"],
  ['packages/agent-workflows/src/probe.ts', "globalThis.fetch('https://example.invalid');"],
  ['apps/api/src/probe.ts', "import { createRequire } from 'node:module';"],
];

test('M1 boundaries: forbidden imports are lint errors', async () => {
  for (const [filePath, code] of cases) {
    const [result] = await eslint.lintText(code, { filePath });
    assert.ok(result.messages.some((m) => m.ruleId === 'architecture/boundaries'), `${filePath}: ${code}\n${JSON.stringify(result.messages)}`);
  }
});

test('M1 boundaries: permitted imports pass', async () => {
  for (const [filePath, code] of [
    ['apps/web/src/probe.ts', "import '@echoes-of-home/validation/env';"],
    ['apps/web/src/probe.ts', "import type { X } from '@echoes-of-home/shared-types';"],
    ['packages/agent-workflows/src/probe.ts', "import '@echoes-of-home/ai-providers';"],
    ['packages/ai-providers/src/adapters/openai.ts', "import OpenAI from 'openai';"],
    ['packages/media-storage/src/adapters/cloudinary.ts', "import 'cloudinary';"],
    ['packages/database/src/probe.ts', "import '@echoes-of-home/auth';"],
    ['packages/auth/src/probe.ts', 'export function can() { return false; }'],
  ]) {
    const [result] = await eslint.lintText(code, { filePath });
    assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
  }
});

test('M1 boundaries: the CI lint CLI rejects a forbidden web import', () => {
  const result = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '--no-inline-config', '--stdin', '--stdin-filename', 'apps/web/src/probe.ts'], {
    input: "/* eslint-disable */ import '@echoes-of-home/database';", encoding: 'utf8',
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /architecture\/boundaries/);
});
