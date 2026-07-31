const KNOWRA_LOCK_NAMESPACE = 1266775634;
const KNOWRA_LOCK_RESOURCE = 32;

async function acquireTransactionLock(transaction, mode) {
  if (typeof transaction?.$queryRawUnsafe !== 'function') return;
  const functionName = mode === 'shared'
    ? 'pg_advisory_xact_lock_shared'
    : 'pg_advisory_xact_lock';
  await transaction.$queryRawUnsafe(
    `SELECT ${functionName}($1::integer, $2::integer)::text AS lock_acquired`,
    KNOWRA_LOCK_NAMESPACE,
    KNOWRA_LOCK_RESOURCE
  );
}

export function createPostgresAdvisoryLock(client) {
  async function run(mode, operation) {
    if (typeof client?.$transaction !== 'function') {
      return operation(client);
    }
    return client.$transaction(
      async (transaction) => {
        await acquireTransactionLock(transaction, mode);
        return operation(transaction);
      },
      { isolationLevel: 'Serializable' }
    );
  }

  return {
    runShared(operation) {
      return run('shared', operation);
    },
    runExclusive(operation) {
      return run('exclusive', operation);
    }
  };
}

export function isPostgresMutation(name) {
  return /^(create|import|update|delete|restore|permanently|empty|set|remove|assign|confirm|mark|request|archive|submit|validate)/.test(name);
}

export function wrapHandlersWithPostgresAdvisoryLock(
  handlers,
  advisoryLock,
  {
    skip = (name) => (
      name === 'permanentlyDeleteNote'
      || name === 'emptyRecycleBin'
    )
  } = {}
) {
  return Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [
      name,
      typeof handler === 'function'
        ? (
            skip(name)
              ? handler
              : (...args) => (
                  isPostgresMutation(name)
                    ? advisoryLock.runExclusive(() => handler(...args))
                    : advisoryLock.runShared(() => handler(...args))
                )
          )
        : handler
    ])
  );
}
