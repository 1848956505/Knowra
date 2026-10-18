/**
 * 固定同步仓储端口（本地 JSON / SQLite 共用）。
 * store.available: boolean
 * store.readSnapshot(callback): callback(tx) 的同步返回值，只读快照。
 * store.runTransaction(callback, {beforeCommit}?): 同步、原子事务；回调抛错必须回滚。
 * beforeCommit 在最后持久提交点调用（SQLite COMMIT / JSON atomic rename 前），Promise/false 必须拒绝。
 * tx仅在readSnapshot/runTransaction同步作用域存活，退出后全部方法失效。
 * tx.identity(): { datasetId:string, datasetEpoch:string }
 * tx.get(collection,id): 深拷贝记录或 null
 * tx.list(collection): 深拷贝记录数组
 * tx.insert(collection,record): 唯一 id；重复时抛 CONFLICT
 * tx.replace(collection,record,expectedRevision?): 不存在或 CAS 不符抛 CONFLICT
 * collections 固定为 workspaces/documents/tasks/attempts/receipts。
 * 所有记录均携带 datasetId/datasetEpoch（不外发）。receipt.id 由服务生成唯一键。
 * 事务禁止 Promise、文件/网络 IO；提交前 guard/authorize 由 service 执行。
 * files 可选独立端口：stage({workspaceId,documentId,attachmentId,fileName,mimeType,bytes})
 *   => {metadata:{fileName,mimeType,size,sha256,storageKey,...}, commit(), discard()}
 * files.read(attachment) => {bytes,mimeType,width,height}，必须核验 hash/大小/像素。
 * stage 在事务前完成所有验证和最终受管文件安置；commit 仅标记成功，discard 清理。
 */
export const TASK_WORKSPACE_COLLECTIONS = Object.freeze(['workspaces', 'documents', 'tasks', 'attempts', 'receipts']);
