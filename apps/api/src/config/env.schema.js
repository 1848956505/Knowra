export function normalizeEnv(input = {}) {
  const persistenceDriver = input.PERSISTENCE_DRIVER?.trim() || 'local-json';
  if (!['local-json', 'postgres'].includes(persistenceDriver)) {
    throw new Error(
      `Unsupported PERSISTENCE_DRIVER: ${persistenceDriver}. `
      + 'Use local-json or postgres.'
    );
  }

  return {
    PERSISTENCE_DRIVER: persistenceDriver,
    DATABASE_URL: input.DATABASE_URL?.trim() || '',
    DIRECT_URL: input.DIRECT_URL?.trim() || '',
    STORAGE_MODE: input.STORAGE_MODE?.trim() || 'local-first',
    STORAGE_UPLOADS_DIR: input.STORAGE_UPLOADS_DIR?.trim() || 'storage/uploads',
    STORAGE_EXPORTS_DIR: input.STORAGE_EXPORTS_DIR?.trim() || 'storage/exports',
    STORAGE_TEMP_DIR: input.STORAGE_TEMP_DIR?.trim() || 'storage/temp'
  };
}
