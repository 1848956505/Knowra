// Local services only mutate model state. File cleanup belongs to coordinators
// after their transaction commits, never inside this wrapper.
export function bindLocalServiceTransactions(service, runTransaction, readOnlyMethods) {
  const readOnly = new Set(readOnlyMethods);
  for (const [name, operation] of Object.entries(service)) {
    if (typeof operation !== 'function' || readOnly.has(name)) continue;
    service[name] = (...args) => runTransaction(() => operation.apply(service, args));
  }
  return service;
}
