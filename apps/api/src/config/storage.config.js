import { normalizeEnv } from './env.schema.js';

export function createStorageConfig(env = process.env) {
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
