export type EnvironmentInput = Readonly<Record<string, string | undefined>>;

export interface NormalizedEnvironment {
  PERSISTENCE_DRIVER: 'local-json' | 'postgres';
  DATABASE_URL: string;
  DIRECT_URL: string;
  STORAGE_MODE: string;
  STORAGE_UPLOADS_DIR: string;
  STORAGE_EXPORTS_DIR: string;
  STORAGE_TEMP_DIR: string;
}

export function normalizeEnv(input: EnvironmentInput = {}): NormalizedEnvironment {
  const persistenceDriver = input.PERSISTENCE_DRIVER?.trim() || 'local-json';
  if (persistenceDriver !== 'local-json' && persistenceDriver !== 'postgres') {
    throw new Error(`Unsupported PERSISTENCE_DRIVER: ${persistenceDriver}. ` + 'Use local-json or postgres.');
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
