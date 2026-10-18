/** 只声明协议，不包含状态机。所有操作只调用唯一任务工作区 service。 */
const id = { type: 'string', minLength: 1, maxLength: 128 };
const operationId = { type: 'string', minLength: 36, maxLength: 36 };
const revision = { type: 'integer', minimum: 1 };
const text = maxLength => ({ type: 'string', maxLength });
const page = { limit: { type: 'integer', minimum: 1, maximum: 50 }, cursor: { type: 'string', minLength: 1, maxLength: 2048 } };
const workspace = { workspaceId: id }, document = { ...workspace, documentId: id }, task = { ...workspace, taskId: id };
const mutation = { operationId, ...task }, lease = { ...mutation, attemptId: id, generation: revision };
const artifact = { type: 'object', properties: { documentId: id, versionId: id }, required: ['documentId', 'versionId'], additionalProperties: false };
const tool = (method, taskCapability, description, properties, required = [], write = false) => ({
  method, taskCapability, taskTool: true, write,
  description, inputSchema: { type: 'object', properties, required, additionalProperties: false }
});
export function createTaskMcpTools() {
  return {
    task_workspaces_list: tool('listWorkspaces', 'read', '列出明确获准的任务工作区；授权覆盖现有及以后新建的文档。', page),
    task_documents_list: tool('listDocuments', 'read', '列出任务工作区文档及版本，不包含普通私人笔记。', { ...workspace, ...page }, ['workspaceId']),
    task_documents_read: tool('getDocument', 'read', '按不可变版本分段读取文档，每页最多 16384 个 UTF-16 单位。',
      { ...document, versionId: id, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 } }, ['workspaceId', 'documentId']),
    task_documents_create: tool('createDocument', 'writeDocuments', '在获准协写的工作区创建文档。正文单次最多 256KiB UTF-8。',
      { operationId, ...workspace, title: text(300), markdown: text(262144) }, ['operationId', 'workspaceId', 'title', 'markdown'], true),
    task_documents_update: tool('updateDocument', 'writeDocuments', '使用当前 revision 协写文档；不会改写已冻结的需求版本。',
      { operationId, ...document, expectedRevision: revision, title: text(300), markdown: text(262144) }, ['operationId', 'workspaceId', 'documentId', 'expectedRevision'], true),
    tasks_list: tool('listTasks', 'read', '列出任务状态与可领取性，不授予发布或验收权限。',
      { ...workspace, ...page, status: { type: 'string', enum: ['draft', 'ready', 'running', 'review', 'accepted', 'cancelled'] } }, ['workspaceId']),
    tasks_get: tool('getTask', 'read', '读取当前需求、当前执行和最新验收记录。', task, ['workspaceId', 'taskId']),
    task_events_list: tool('listTaskEvents', 'read', '分页读取任务执行记录。',
      { ...task, afterSequence: { type: 'integer', minimum: 0 }, limit: page.limit }, ['workspaceId', 'taskId']),
    tasks_claim: tool('claimTask', 'executeTasks', '原子领取任务，默认租约五分钟；建议每六十秒续租。',
      { ...mutation, expectedRevision: revision }, ['operationId', 'workspaceId', 'taskId', 'expectedRevision'], true),
    tasks_renew: tool('renewTask', 'executeTasks', '续租本人当前有效执行；过期租约不能复活。', lease, Object.keys(lease), true),
    tasks_progress: tool('reportProgress', 'executeTasks', '记录本人当前执行进展，最多 4KiB UTF-8。',
      { ...lease, message: text(4096) }, [...Object.keys(lease), 'message'], true),
    tasks_submit: tool('submitTask', 'executeTasks', '冻结当前成果版本并提交给用户验收；提交不代表验收通过。',
      { ...lease, summary: text(16384), artifacts: { type: 'array', items: artifact, maxItems: 20 } }, [...Object.keys(lease), 'summary', 'artifacts'], true),
    tasks_release: tool('releaseTask', 'executeTasks', '释放本人当前有效任务执行。', { ...lease, message: text(4096) }, Object.keys(lease), true),
    task_images_read: tool('readAttachment', 'includeImages', '读取指定不可变文档版本实际引用的单张图片；须独立图片授权。仅 PNG/JPEG/WebP，最多 5MiB 和 16MP。',
      { ...document, versionId: id, attachmentId: id }, ['workspaceId', 'documentId', 'versionId', 'attachmentId'])
  };
}
