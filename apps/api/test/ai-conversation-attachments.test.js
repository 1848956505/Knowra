import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createFileDataStore } from '../src/infrastructure/file-data-store.js';
import { createConversationAttachmentService, CONVERSATION_ATTACHMENT_LIMITS } from '../src/modules/ai/conversation-attachments.js';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const textParser = async ({ buffer }) => ({ status: 'ready', text: buffer.toString('utf8'), segments: [] });
async function fixture(run, parser = textParser) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-conversation-files-')), uploadsDir = path.join(root, 'uploads');
  let data, service;
  const restart = async nextParser => {
    await service?.close(); data = createFileDataStore(path.join(root, 'data.json'));
    service = createConversationAttachmentService({ conversationStore: data.aiConversationStore, uploadsDir, ownerId: 'test', parser: nextParser ?? parser });
  };
  try {
    await restart();
    const conversation = await data.aiConversationStore.createConversation({ ownerId: 'test', actorId: 'test', spaceId: 'space-one' });
    await run({ root, uploadsDir, conversation, restart, get service() { return service; }, get store() { return data.aiConversationStore; }, rotate: () => data.aiRepository.rotateEpoch(),
      upload: (bytes = Buffer.from('合成附件'), extra = {}) => service.upload({ conversationId: conversation.conversationId, uploadKey: randomUUID(), fileName: '附件.txt', mimeType: 'text/plain', bytes, ...extra }),
      file: record => path.join(uploadsDir, 'ai-conversations', `${record.attachmentId}.bin`) });
  } finally { await service?.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

export const aiConversationAttachmentTests = [
  { name: '会话附件同payload键幂等、重启验证完整字节与解析hash，不自动入笔记', run: () => fixture(async f => {
    const input = { conversationId: f.conversation.conversationId, uploadKey: 'upload-key-one', fileName: '显示名称.txt', mimeType: 'text/plain', bytes: Buffer.from('合成正文\n第二行') };
    await assert.rejects(f.service.upload({ ...input, fileName: '../../显示名称.txt' }), { code: 'AI_ATTACHMENT_UPLOAD_INVALID' });
    const row = await f.service.upload(input); assert.equal(row.storageStatus, 'ready'); assert.equal(row.parseStatus, 'ready');
    assert.equal(row.sha256, sha256(input.bytes)); assert.equal(row.parsedTextHash, sha256(input.bytes));
    assert.deepEqual(await f.service.upload(input), row);
    await assert.rejects(f.service.upload({ ...input, bytes: Buffer.from('不同正文') }), { code: 'AI_IDEMPOTENCY_CONFLICT' });
    assert.equal(fs.existsSync(f.file(row)), true); assert.equal(fs.existsSync(path.join(f.root, '显示名称.txt')), false);
    await f.restart(); const result = await f.service.readVerified({ conversationId: row.conversationId, attachmentId: row.attachmentId });
    assert.deepEqual(result.bytes, input.bytes); assert.equal(result.segments.map(part => part.text).join(''), input.bytes.toString());
    assert.equal('path' in result, false); assert.equal('diskPath' in result, false); assert.equal((await f.service.list(row.conversationId)).length, 1);
  }) },
  { name: '会话附件解析段落gap连续保存UTF16范围，图片明确不支持视觉', run: () => fixture(async f => {
    await f.restart(async ({ mimeType }) => mimeType === 'image/png' ? { status: 'unsupported', width: 2, height: 3 }
      : { status: 'ready', text: '第一页\n第二页', segments: [{ start: 0, end: 3, page: 1 }, { start: 4, end: 7, page: 2 }] });
    const row = await f.upload(); assert.deepEqual(row.segments.map(segment => [segment.start, segment.end]), [[0, 3], [3, 4], [4, 7]]);
    assert.equal(row.parsedTextHash, sha256('第一页\n第二页'));
    const image = await f.upload(Buffer.from('合成图片bytes'), { mimeType: 'image/png', fileName: 'image.png' });
    assert.equal(image.parseStatus, 'vision_unsupported'); assert.deepEqual(image.imageMetadata, { width: 2, height: 3, format: 'png' }); assert.deepEqual(image.segments, []);
  }) },
  { name: '附件只属于当前owner、dataset、epoch、space和会话，其他会话及恢复后不可读', run: () => fixture(async f => {
    const row = await f.upload(), other = await f.store.createConversation({ ownerId: 'test', actorId: 'test', spaceId: 'space-two' });
    await assert.rejects(f.service.readVerified({ conversationId: other.conversationId, attachmentId: row.attachmentId }), { code: 'AI_ATTACHMENT_SCOPE_FORBIDDEN' });
    const outsider = createConversationAttachmentService({ conversationStore: f.store, uploadsDir: f.uploadsDir, ownerId: 'another', parser: textParser });
    try { await assert.rejects(outsider.list(row.conversationId), { code: 'AI_ATTACHMENT_SCOPE_FORBIDDEN' }); } finally { await outsider.close(); }
    await f.rotate(); await assert.rejects(f.service.readVerified({ conversationId: row.conversationId, attachmentId: row.attachmentId }), { code: 'AI_DATASET_STALE' });
    let parsed = 0; await f.restart(async input => { parsed++; return textParser(input); }); await f.service.recover(); assert.equal(parsed, 0); assert.equal(fs.existsSync(f.file(row)), true);
  }) },
  { name: '附件大小和会话active件数/总字节配额保留pending占用，删除释放配额', run: () => fixture(async f => {
    await assert.rejects(f.upload(Buffer.alloc(CONVERSATION_ATTACHMENT_LIMITS.maxFileBytes + 1)), { code: 'AI_ATTACHMENT_UPLOAD_INVALID' });
    for (let i = 0; i < 20; i++) await f.upload(Buffer.from('x'));
    await assert.rejects(f.upload(), { code: 'AI_ATTACHMENT_QUOTA_EXCEEDED' });
    const [row] = await f.service.list(f.conversation.conversationId);
    await f.service.remove({ conversationId: row.conversationId, attachmentId: row.attachmentId, expectedRevision: row.revision });
    await f.upload();
    const other = await f.store.createConversation({ ownerId: 'test', actorId: 'test', spaceId: 'space-one' });
    for (let i = 0; i < 5; i++) await f.store.stageAttachment({ ownerId: 'test', conversationId: other.conversationId, uploadKey: randomUUID(), fileName: 'pending.txt', mimeType: 'text/plain', size: 5 * 1024 * 1024, sha256: 'a'.repeat(64) });
    await assert.rejects(f.service.upload({ conversationId: other.conversationId, uploadKey: randomUUID(), fileName: 'six.txt', mimeType: 'text/plain', bytes: Buffer.from('x') }), { code: 'AI_ATTACHMENT_QUOTA_EXCEEDED' });
  }) },
  { name: '删除先持久墓碑清正文，重启清理unlink故障且幂等键不复活', run: () => fixture(async f => {
    const input = { conversationId: f.conversation.conversationId, uploadKey: 'remove-upload-key', fileName: 'delete.txt', mimeType: 'text/plain', bytes: Buffer.from('删除正文') };
    const row = await f.service.upload(input);
    await assert.rejects(f.service.remove({ conversationId: row.conversationId, attachmentId: row.attachmentId, expectedRevision: row.revision - 1 }), { code: 'AI_ATTACHMENT_CONFLICT' });
    const unlink = fs.promises.unlink;
    fs.promises.unlink = async () => { throw Object.assign(new Error('合成unlink失败'), { code: 'EACCES' }); };
    try { await assert.rejects(f.service.remove({ conversationId: row.conversationId, attachmentId: row.attachmentId, expectedRevision: row.revision }), { code: 'EACCES' }); }
    finally { fs.promises.unlink = unlink; }
    const tombstone = await f.store.getAttachment(row.attachmentId); assert.equal(tombstone.storageStatus, 'removed'); assert.equal(tombstone.cleanupStatus, 'pending'); assert.deepEqual(tombstone.segments, []); assert.equal(tombstone.parsedTextHash, null);
    await f.restart(); await f.service.recover(); assert.equal(fs.existsSync(f.file(row)), false); assert.equal((await f.store.getAttachment(row.attachmentId)).cleanupStatus, 'complete');
    assert.equal((await f.service.upload(input)).storageStatus, 'removed'); await assert.rejects(f.service.readVerified({ conversationId: row.conversationId, attachmentId: row.attachmentId }), { code: 'AI_ATTACHMENT_REMOVED' });
  }) },
  { name: 'parser迟到结果遭删除CAS拒绝，关闭等待已接纳工作且不再读写', run: () => fixture(async f => {
    let entered, release; const started = new Promise(resolve => { entered = resolve; }), held = new Promise(resolve => { release = resolve; });
    await f.restart(async input => { entered(); await held; return textParser(input); });
    const upload = f.upload(Buffer.from('迟到正文')); await started;
    const [row] = await f.service.list(f.conversation.conversationId);
    const deleted = await f.service.remove({ conversationId: row.conversationId, attachmentId: row.attachmentId, expectedRevision: row.revision });
    let finished = false; const close = f.service.close().then(() => { finished = true; }); await Promise.resolve(); assert.equal(finished, false);
    await assert.rejects(f.service.list(row.conversationId), { code: 'AI_ATTACHMENT_CLOSED' }); release(); const late = await upload; await close;
    assert.equal(late.storageStatus, 'removed'); assert.deepEqual((await f.store.getAttachment(row.attachmentId)).segments, []); assert.equal(fs.existsSync(f.file(deleted)), false);
    await assert.rejects(f.service.readVerified({ conversationId: row.conversationId, attachmentId: row.attachmentId }), { code: 'AI_ATTACHMENT_CLOSED' });
  }) },
  { name: '重启修复pending文件并拒绝缺失、hash损坏、符号链接和非regular文件', run: () => fixture(async f => {
    const bytes = Buffer.from('pending合成正文');
    const pending = await f.store.stageAttachment({ ownerId: 'test', conversationId: f.conversation.conversationId, uploadKey: randomUUID(), fileName: 'pending.txt', mimeType: 'text/plain', size: bytes.length, sha256: sha256(bytes) });
    fs.mkdirSync(path.dirname(f.file(pending)), { recursive: true }); fs.writeFileSync(f.file(pending), bytes);
    await f.restart(); await f.service.recover(); assert.equal((await f.store.getAttachment(pending.attachmentId)).parseStatus, 'ready');
    const broken = await f.upload(), link = await f.upload(), nonregular = await f.upload(), missing = await f.upload();
    fs.writeFileSync(f.file(broken), Buffer.from('wrong'));
    fs.unlinkSync(f.file(link)); fs.symlinkSync(f.file(pending), f.file(link));
    fs.unlinkSync(f.file(nonregular)); fs.mkdirSync(f.file(nonregular)); fs.unlinkSync(f.file(missing));
    for (const row of [broken, link, nonregular]) await assert.rejects(f.service.readVerified({ conversationId: row.conversationId, attachmentId: row.attachmentId }), { code: 'AI_ATTACHMENT_STORAGE_INVALID' });
    await f.service.recover(); for (const row of [broken, link, nonregular, missing]) assert.equal((await f.store.getAttachment(row.attachmentId)).storageStatus, 'missing');
  }) },
  { name: '目录symlink与伪造遍历ID拒绝，conversation边界回调阻止删除space解析', run: () => fixture(async f => {
    fs.mkdirSync(f.uploadsDir); fs.symlinkSync(f.root, path.join(f.uploadsDir, 'ai-conversations'));
    await assert.rejects(f.upload(), { code: 'AI_ATTACHMENT_STORAGE_INVALID' });
    await assert.rejects(f.service.readVerified({ conversationId: f.conversation.conversationId, attachmentId: '../unsafe' }), { code: 'AI_ATTACHMENT_NOT_FOUND' });
    fs.unlinkSync(path.join(f.uploadsDir, 'ai-conversations'));
    const row = await f.upload(); let parsed = 0;
    const blocked = createConversationAttachmentService({ conversationStore: f.store, uploadsDir: f.uploadsDir, ownerId: 'test', parser: async input => { parsed++; return textParser(input); }, assertConversation: async () => { throw Object.assign(new Error('space removed'), { code: 'AI_SCOPE_FORBIDDEN' }); } });
    try { await assert.rejects(blocked.list(row.conversationId), { code: 'AI_SCOPE_FORBIDDEN' }); assert.deepEqual(await blocked.recover(), []); assert.equal(parsed, 0); } finally { await blocked.close(); }
  }) },
  { name: '附件发布采用完整临时文件atomic link，链接失败重启同key可恢复且两实例不重复', run: () => fixture(async f => {
    const input = { conversationId: f.conversation.conversationId, uploadKey: 'atomic-upload-key', fileName: 'atomic.txt', mimeType: 'text/plain', bytes: Buffer.from('完整发布正文') };
    const link = fs.promises.link; fs.promises.link = async () => { throw Object.assign(new Error('合成发布失败'), { code: 'EIO' }); };
    try { await assert.rejects(f.service.upload(input), { code: 'EIO' }); } finally { fs.promises.link = link; }
    const [pending] = await f.store.listAttachments(input.conversationId); assert.equal(fs.existsSync(f.file(pending)), false);
    assert.deepEqual(fs.readdirSync(path.dirname(f.file(pending))), []);
    await f.restart(); await f.service.recover(); assert.equal((await f.store.getAttachment(pending.attachmentId)).storageStatus, 'missing');
    const other = createConversationAttachmentService({ conversationStore: f.store, uploadsDir: f.uploadsDir, ownerId: 'test', parser: textParser });
    try {
      const [first, second] = await Promise.all([f.service.upload(input), other.upload(input)]);
      assert.equal(first.attachmentId, pending.attachmentId); assert.equal(second.attachmentId, pending.attachmentId);
      assert.equal((await f.store.listAttachments(input.conversationId)).length, 1);
      const final = await f.service.readVerified({ conversationId: input.conversationId, attachmentId: first.attachmentId }); assert.deepEqual(final.bytes, input.bytes);
      assert.equal(final.record.parseStatus, 'ready');
    } finally { await other.close(); }
  }) },
  { name: '恢复missing期间删除CAS保留墓碑，当前资料旧临时文件有限清理且历史epoch保留', run: () => fixture(async f => {
    const row = await f.upload(), temporary = path.join(path.dirname(f.file(row)), `${row.attachmentId}.${randomUUID()}.pending`);
    fs.writeFileSync(temporary, '孤儿临时文件'); fs.utimesSync(temporary, new Date(Date.now() - 7200000), new Date(Date.now() - 7200000));
    await f.service.recover(); assert.equal(fs.existsSync(temporary), false);
    fs.unlinkSync(f.file(row));
    const get = f.store.getAttachment; let removeOnce = true;
    f.store.getAttachment = async id => {
      if (id === row.attachmentId && removeOnce) {
        removeOnce = false; const latest = await get(id);
        await f.store.updateAttachment({ ownerId: 'test', attachmentId: id, expectedRevision: latest.revision, patch: { storageStatus: 'removed', parseStatus: 'failed', removedAt: new Date().toISOString(), cleanupStatus: 'pending', segments: [], parsedTextHash: null, imageMetadata: null, parserVersion: null, errorCode: 'AI_ATTACHMENT_REMOVED' } });
      }
      return get(id);
    };
    await f.service.recover(); assert.equal((await get(row.attachmentId)).storageStatus, 'removed'); assert.deepEqual((await get(row.attachmentId)).segments, []); f.store.getAttachment = get;
    const historical = await f.upload(); const oldTemporary = path.join(path.dirname(f.file(historical)), `${historical.attachmentId}.${randomUUID()}.pending`);
    fs.writeFileSync(oldTemporary, '旧epoch文件'); fs.utimesSync(oldTemporary, new Date(Date.now() - 7200000), new Date(Date.now() - 7200000));
    await f.rotate(); await f.service.recover(); assert.equal(fs.existsSync(oldTemporary), true);
  }) },
  { name: '附件读取在stat后文件增长仍只读取record.size加1，异常图片元数据不冒称视觉支持', run: () => fixture(async f => {
    const row = await f.upload(Buffer.from('增长前正文')), originalOpen = fs.promises.open; let largestRead = 0;
    fs.promises.open = async (...args) => {
      const handle = await originalOpen(...args);
      if (args[0] === f.file(row)) {
        const stat = handle.stat.bind(handle), read = handle.read.bind(handle); let grow = true;
        handle.stat = async () => { const snapshot = await stat(); if (grow) { grow = false; fs.appendFileSync(f.file(row), Buffer.alloc(2 * 1024 * 1024)); } return snapshot; };
        handle.read = async (buffer, offset, length, position) => { largestRead = Math.max(largestRead, length); return read(buffer, offset, length, position); };
      }
      return handle;
    };
    try { await assert.rejects(f.service.readVerified({ conversationId: row.conversationId, attachmentId: row.attachmentId }), { code: 'AI_ATTACHMENT_STORAGE_INVALID' }); }
    finally { fs.promises.open = originalOpen; }
    assert.equal(largestRead, row.size + 1);
    await f.restart(async () => ({ status: 'unsupported', width: 1000000, height: 1000000 }));
    const image = await f.upload(Buffer.from('合成图像header'), { fileName: 'bad.png', mimeType: 'image/png' });
    assert.equal(image.parseStatus, 'failed'); assert.equal(image.errorCode, 'AI_ATTACHMENT_IMAGE_INVALID'); assert.equal(image.imageMetadata, null);
  }) }
];
