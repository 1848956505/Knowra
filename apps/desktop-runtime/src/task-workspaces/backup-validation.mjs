import { readTaskWorkspaceSnapshot } from './sqlite-store.mjs';

/** 备份复用完整文件清单；读取时仍再次用真实解码器校验像素和原字节hash。 */
export function validateTaskWorkspaceBackup(db, inventoryFiles) {
  const snapshot = readTaskWorkspaceSnapshot(db);
  if (!snapshot) return { workspaceCount: 0, taskAttachmentCount: 0 };
  const files = new Map(inventoryFiles.map(file => [file.path, file]));
  let taskAttachmentCount = 0;
  for (const document of snapshot.documents) for (const attachment of document.attachments) {
    const file = files.get(`uploads/${attachment.storageKey}`);
    if (!file || file.sha256 !== attachment.sha256 || file.size !== attachment.size) throw new Error('任务工作区备份附件缺失或内容校验失败。');
    taskAttachmentCount++;
  }
  return { workspaceCount: snapshot.workspaces.length, taskAttachmentCount };
}
