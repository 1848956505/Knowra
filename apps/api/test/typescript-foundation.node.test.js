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
  for (const file of ['errors/app-error.ts', 'config/env.schema.ts', 'config/storage.config.ts']) {
    assert.ok(Object.hasOwn(result.metafile.inputs, `apps/api/src/${file}`), file);
  }
  assert.ok(result.outputFiles[0].contents.length > 0);
});
