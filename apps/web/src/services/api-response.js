export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asItems(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

export function getData(payload) {
  return payload?.data;
}
