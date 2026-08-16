import type { WorkspaceSnapshot } from '../src/index.js';

export const folderNormalizationVector: {
  input: unknown[];
  expected: unknown[];
};

export const recoveryVectors: Array<{
  input: {
    backendAvailable: boolean;
    cachedSnapshot: WorkspaceSnapshot | null;
  };
  expected: 'backend' | 'cache' | 'mock';
}>;
