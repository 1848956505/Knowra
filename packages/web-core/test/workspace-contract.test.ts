import { describe, expect, it } from 'vitest';
import { normalizeFolderTree, selectLoadRecovery } from '../src/index.js';
import { folderNormalizationVector, recoveryVectors } from './workspace-vectors.js';

describe('shared workspace vectors', () => {
  it('normalizes the same folder vector consumed by V3', () => {
    expect(normalizeFolderTree(folderNormalizationVector.input)).toEqual(folderNormalizationVector.expected);
  });

  it('selects recovery with the same vectors consumed by V3', () => {
    for (const vector of recoveryVectors) {
      expect(selectLoadRecovery(vector.input)).toBe(vector.expected);
    }
  });
});
