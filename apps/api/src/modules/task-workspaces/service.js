import { randomUUID } from 'node:crypto';
import { mutationNames, mutationFields, applyMutation } from './mutations.js';
import { createTaskWorkspaceTransactions } from './transaction-context.js';
import { createTaskWorkspaceQueries } from './queries.js';
import { createTaskWorkspaceAttachments } from './attachments.js';

/** HTTP/MCP 共用领域服务；协议适配器不能自行修改状态。 */
export function createTaskWorkspaceService({
  store,
  files,
  clock = Date.now,
  idGenerator = randomUUID,
  authorize,
}) {
  const { read, mutate } = createTaskWorkspaceTransactions({
    store,
    clock,
    idGenerator,
    authorize,
  });
  const service = {
    ...createTaskWorkspaceQueries({ store, files, read, authorize }),
    ...createTaskWorkspaceAttachments({ files, read, mutate, idGenerator }),
  };
  for (const kind of mutationNames) {
    service[kind] = (ctx, input) => {
      mutationFields(kind, input);
      return mutate(ctx, kind, input, (tx, helpers) =>
        applyMutation(kind, tx, ctx, input, helpers),
      );
    };
  }
  return service;
}
