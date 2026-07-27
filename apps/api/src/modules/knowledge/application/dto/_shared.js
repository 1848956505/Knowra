import { randomUUID } from 'node:crypto';
import { validationError } from '../knowledge-errors.js';

export function trimIfString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

export function createSlug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function createPrefixedId(prefix, seedValue = '') {
  const seed = createSlug(seedValue);
  const readablePart = seed ? `${seed}-` : '';
  return `${prefix}-${readablePart}${randomUUID()}`;
}

export function requireText(value, code, message) {
  const normalized = trimIfString(value);
  if (typeof normalized !== 'string' || !normalized) {
    throw validationError(code, message);
  }
  return normalized;
}

export function normalizeOptionalId(value, code, message) {
  if (value === null || value === undefined) {
    return null;
  }
  return requireText(value, code, message);
}

export function normalizeIdList(value, code, message) {
  if (!Array.isArray(value)) {
    throw validationError(code, message);
  }

  const normalized = value.map((item) => requireText(item, code, message));
  return [...new Set(normalized)];
}
