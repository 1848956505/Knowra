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
