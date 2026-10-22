import { normalizeEnv } from './env.schema.ts';
import type { EnvironmentInput, NormalizedEnvironment } from './env.schema.ts';

export interface StorageConfig {
  persistenceDriver: NormalizedEnvironment['PERSISTENCE_DRIVER'];
  databaseUrl: string;
  directUrl: string;
  mode: string;
  uploadsDir: string;
  exportsDir: string;
  tempDir: string;
}

export function createStorageConfig(env: EnvironmentInput = process.env): StorageConfig {
  const normalizedEnv = normalizeEnv(env);

  return {
    persistenceDriver: normalizedEnv.PERSISTENCE_DRIVER,
    databaseUrl: normalizedEnv.DATABASE_URL,
    directUrl: normalizedEnv.DIRECT_URL,
    mode: normalizedEnv.STORAGE_MODE,
    uploadsDir: normalizedEnv.STORAGE_UPLOADS_DIR,
    exportsDir: normalizedEnv.STORAGE_EXPORTS_DIR,
    tempDir: normalizedEnv.STORAGE_TEMP_DIR
  };
}
