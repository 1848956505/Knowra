import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError, createAppError } from '../src/errors/app-error.ts';
import * as legacyErrors from '../src/errors/app-error.js';
import { normalizeEnv } from '../src/config/env.schema.ts';
import { normalizeEnv as legacyNormalizeEnv } from '../src/config/env.schema.js';
import { createStorageConfig } from '../src/config/storage.config.ts';
import { createStorageConfig as legacyCreateStorageConfig } from '../src/config/storage.config.js';

test('JS compatibility entries preserve the exact TS exports and error identity', () => {
  assert.equal(legacyErrors.AppError, AppError);
  assert.equal(legacyErrors.createAppError, createAppError);
  assert.equal(legacyNormalizeEnv, normalizeEnv);
  assert.equal(legacyCreateStorageConfig, createStorageConfig);
  const error = legacyErrors.createAppError('TEST_ERROR', 'message');
  assert.ok(error instanceof AppError);
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'AppError');
  assert.equal(error.code, 'TEST_ERROR');
  assert.equal(error.statusCode, 400);
});

test('AppError preserves defaults, explicit overrides and existing cause behavior', () => {
  const defaults = new AppError('message');
  assert.equal(defaults.code, 'APPLICATION_ERROR');
  assert.equal(defaults.statusCode, 400);
  assert.equal(Object.hasOwn(defaults, 'cause'), false);
  const cause = new Error('original');
  const error = createAppError('EXPLICIT', 'message', 409, {
    code: 'IGNORED',
    statusCode: 500,
    cause,
    details: { id: 'synthetic' }
  });
  assert.equal(error.code, 'EXPLICIT');
  assert.equal(error.statusCode, 409);
  assert.equal(error.cause, cause);
  assert.equal(Object.hasOwn(error, 'details'), false);
  for (const value of [undefined, null, false, 0, '']) {
    assert.equal(Object.hasOwn(new AppError('message', { cause: value }), 'cause'), false);
  }
});

test('environment normalization preserves defaults, trimming and validation', () => {
  assert.deepEqual(normalizeEnv(), {
    PERSISTENCE_DRIVER: 'local-json',
    DATABASE_URL: '',
    DIRECT_URL: '',
    STORAGE_MODE: 'local-first',
    STORAGE_UPLOADS_DIR: 'storage/uploads',
    STORAGE_EXPORTS_DIR: 'storage/exports',
    STORAGE_TEMP_DIR: 'storage/temp'
  });
  assert.deepEqual(
    createStorageConfig({
      PERSISTENCE_DRIVER: ' postgres ',
      DATABASE_URL: ' db ',
      DIRECT_URL: ' direct ',
      STORAGE_MODE: ' custom ',
      STORAGE_UPLOADS_DIR: ' uploads ',
      STORAGE_EXPORTS_DIR: ' exports ',
      STORAGE_TEMP_DIR: ' temp '
    }),
    {
      persistenceDriver: 'postgres',
      databaseUrl: 'db',
      directUrl: 'direct',
      mode: 'custom',
      uploadsDir: 'uploads',
      exportsDir: 'exports',
      tempDir: 'temp'
    }
  );
  assert.deepEqual(normalizeEnv({ PERSISTENCE_DRIVER: '  ', STORAGE_MODE: '' }), normalizeEnv());
  assert.throws(() => normalizeEnv({ PERSISTENCE_DRIVER: 'sqlite' }), {
    message: 'Unsupported PERSISTENCE_DRIVER: sqlite. Use local-json or postgres.'
  });
});

test('desktop runtime bundle includes migrated TS through legacy JS entries', async () => {
  const { build } = await import('esbuild');
  const repo = new URL('../../../', import.meta.url);
  const result = await build({
    absWorkingDir: (await import('node:url')).fileURLToPath(repo),
    entryPoints: ['apps/desktop-shell/src/runtime-entry.mjs'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: ['@prisma/client', 'sharp'],
    metafile: true,
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"
    }
  });
  for (const file of [
    'errors/app-error.ts',
    'config/env.schema.ts',
    'config/storage.config.ts',
    'http/response.ts',
    'http/cors.ts',
    'modules/knowledge/infrastructure/knowledge-artifact-provenance-repository.ts',
    'modules/knowledge/application/knowledge-artifact-provenance-read.ts',
    'modules/knowledge/domain/note.ts',
    'modules/knowledge/domain/content-annotation.ts',
    'modules/knowledge/infrastructure/knowledge-space-repository.ts',
    'modules/knowledge/infrastructure/folder-repository.ts',
    'modules/knowledge/infrastructure/tag-group-repository.ts',
    'modules/knowledge/infrastructure/tag-repository.ts',
    'modules/knowledge/domain/knowledge-artifact-provenance-contract.ts',
    'modules/knowledge/domain/knowledge-artifact-provenance-state.ts',
    'modules/knowledge/domain/analysis-scope-version-alias.ts',
    'modules/knowledge/domain/note-version.ts',
    'modules/knowledge/domain/note-version-page.ts',
    'modules/knowledge/domain/note-version-references.ts',
    'modules/knowledge/domain/note-version-retention.ts',
    'modules/knowledge/domain/evidence-applicability.ts',
    'modules/knowledge/domain/knowledge-space.ts',
    'modules/knowledge/domain/folder.ts',
    'modules/knowledge/domain/tag-group.ts',
    'modules/knowledge/domain/tag.ts',
    'modules/knowledge/domain/default-tag-groups.ts',
    'modules/knowledge/domain/knowledge-item.ts',
    'modules/knowledge/domain/knowledge-evidence.ts',
    'modules/knowledge/domain/learning-objective.ts',
    'modules/knowledge/domain/exam-profile.ts',
    'modules/knowledge/domain/exam-focus.ts',
    'modules/knowledge/domain/question.ts',
    'modules/knowledge/domain/question-source.ts'
  ]) {
    assert.ok(Object.hasOwn(result.metafile.inputs, `apps/api/src/${file}`), file);
  }
  assert.ok(result.outputFiles[0].contents.length > 0);
});

test('HTTP and preview compatibility entries preserve TS export identity', async () => {
  for (const name of ['http/response', 'http/cors', 'presentation/markdown-preview']) {
    const legacy = await import(`../src/${name}.js`);
    const migrated = await import(`../src/${name}.ts`);
    assert.deepEqual(Object.keys(legacy), Object.keys(migrated));
    for (const key of Object.keys(legacy)) assert.equal(legacy[key], migrated[key]);
  }
});

function recordResponse() {
  return {
    status: undefined,
    headers: {},
    content: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(status, headers = {}) {
      this.status = status;
      Object.assign(this.headers, headers);
    },
    end(content) {
      this.content = content;
    }
  };
}

test('typed response helpers preserve JSON envelopes and binary security headers', async () => {
  const { sendJson, sendError, sendBinary } = await import('../src/http/response.ts');
  const response = recordResponse();
  sendJson(response, 201, { data: { id: 'synthetic' } });
  assert.equal(response.status, 201);
  assert.equal(response.content, '{"data":{"id":"synthetic"}}');
  sendError(response, 409, 'CONFLICT', 'message');
  assert.equal(response.content, '{"error":{"code":"CONFLICT","message":"message"}}');
  const content = Buffer.from('synthetic');
  sendBinary(response, 200, content, ' TEXT/HTML; charset=utf-8 ', '测试\r\n".html');
  assert.equal(response.content, content);
  assert.deepEqual(response.headers, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': content.byteLength,
    'Content-Disposition': 'attachment; filename="_____.html"; filename*=UTF-8\'\'%E6%B5%8B%E8%AF%95___.html',
    'Content-Security-Policy': 'sandbox',
    'X-Content-Type-Options': 'nosniff'
  });
  sendBinary(response, 200, content, 'image/png');
  assert.equal(response.headers['Content-Type'], 'image/png');
  assert.match(response.headers['Content-Disposition'], /^inline; filename="attachment.bin"/);
});

test('typed CORS helpers preserve parsing, preflight and wildcard behavior', async () => {
  const { parseCorsAllowedOrigins, applyCorsHeaders, handleCorsPreflight } = await import('../src/http/cors.ts');
  assert.deepEqual(parseCorsAllowedOrigins(), []);
  assert.deepEqual(parseCorsAllowedOrigins(null), ['null']);
  assert.deepEqual(parseCorsAllowedOrigins([' a ', '', 2]), ['a', '2']);
  assert.deepEqual(parseCorsAllowedOrigins(' a, , b '), ['a', 'b']);
  const response = recordResponse();
  assert.equal(applyCorsHeaders(response, { headers: {} }, ['*']), false);
  assert.equal(handleCorsPreflight({ request: { method: 'OPTIONS', headers: {} }, response }), false);
  const request = { method: 'OPTIONS', headers: { origin: 'https://example.test' } };
  assert.equal(handleCorsPreflight({ request, response }), true);
  assert.equal(response.status, 403);
  assert.deepEqual(JSON.parse(response.content), {
    error: { code: 'CORS_ORIGIN_FORBIDDEN', message: 'CORS origin is not allowed' }
  });
  const allowed = recordResponse();
  assert.equal(handleCorsPreflight({ request, response: allowed, allowedOrigins: [request.headers.origin] }), true);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.content, undefined);
  assert.equal(allowed.headers.Vary, 'Origin');
  assert.equal(allowed.headers['Access-Control-Allow-Origin'], request.headers.origin);
  const wildcard = recordResponse();
  assert.equal(applyCorsHeaders(wildcard, request, ['*']), true);
  assert.equal(wildcard.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(Object.hasOwn(wildcard.headers, 'Vary'), false);
});

test('typed Markdown preview preserves empty, escaped and fallback heading output', async () => {
  const { extractMarkdownHeadings, renderMarkdownPreview } = await import('../src/presentation/markdown-preview.ts');
  assert.equal(renderMarkdownPreview(null), '<p class="preview-empty">Nothing to preview yet.</p>');
  assert.deepEqual(extractMarkdownHeadings('# !!!\r\n## 中文 标题'), [
    { level: 1, title: '!!!', id: 'section-1' },
    { level: 2, title: '中文 标题', id: '中文-标题' }
  ]);
  assert.equal(renderMarkdownPreview('# !!!\n\n<script>'), '<h1 id="section-1">!!!</h1><p>&lt;script&gt;</p>');
  assert.equal(
    renderMarkdownPreview('![image](http://example.test/a.png)'),
    '<p><span class="preview-blocked-image">[已阻止不安全图片：image]</span></p>'
  );
});
