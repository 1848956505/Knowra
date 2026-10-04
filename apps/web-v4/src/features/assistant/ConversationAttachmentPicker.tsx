import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { Button } from '../../components/ui/button/Button';
import { FileDropField } from '../../components/ui/file/FileDropField';
import { conversationAttachmentApi } from './conversationAttachmentApi';
import styles from './ConversationAttachmentPicker.module.css';

export interface ConversationAttachment {
  attachmentId: string; conversationId: string; revision: number; fileName: string; mimeType: string; size: number;
  sha256: string; storageStatus: 'pending' | 'ready' | 'missing' | 'removed';
  parseStatus: 'pending' | 'ready' | 'failed' | 'vision_unsupported'; errorCode: string | null;
  parserVersion: string | null; parsedTextHash: string | null; imageMetadata: ImageMetadata | null;
  removedAt: string | null; createdAt: string; updatedAt: string;
}
interface ImageMetadata { width: number; height: number; format: string }
export interface ConversationAttachmentPreview {
  attachment: ConversationAttachment; segments: Array<{ text: string; start: number; end: number; page?: number }>;
  imageMetadata: ImageMetadata | null;
}
export interface ConversationAttachmentApi {
  list(id: string): Promise<ConversationAttachment[]>;
  upload(id: string, input: { uploadKey: string; fileName: string; mimeType: string; contentBase64: string }): Promise<ConversationAttachment>;
  preview(id: string, attachmentId: string): Promise<ConversationAttachmentPreview>;
  content(id: string, attachmentId: string): Promise<Blob>;
  remove(id: string, attachmentId: string, expectedRevision: number): Promise<ConversationAttachment>;
}
const accepted = '.txt,.md,.markdown,.pdf,.docx,.png,.jpg,.jpeg';
const types: Record<string, string> = { txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const maxBytes = 5 * 1024 * 1024;
function parseErrorText(code: string | null) {
  if (code === 'AI_ATTACHMENT_CONFLICT') return '附件版本已变化，请刷新附件后重试。';
  if (code === 'AI_ATTACHMENT_SCOPE_FORBIDDEN') return '无权访问当前对话附件。';
  if (code === 'AI_ATTACHMENT_REMOVED' || code === 'AI_ATTACHMENT_NOT_FOUND') return '附件已移除或不存在，请刷新附件列表。';
  if (code === 'AI_ATTACHMENT_STORAGE_INVALID') return '附件完整性校验失败，请移除后重新上传。';
  if (code === 'AI_ATTACHMENT_UPLOAD_INVALID') return '附件格式或大小无效，请检查文件后重新上传。';
  if (code === 'AI_ATTACHMENT_ENCRYPTED') return '文件已加密，请解密后重新上传。';
  if (code === 'AI_ATTACHMENT_PDF_NO_TEXT_LAYER') return 'PDF 没有可提取的文字层，当前尚不支持 OCR。';
  if (code === 'AI_ATTACHMENT_NO_TEXT') return '未找到可提取的文字，请检查文件内容。';
  if (code === 'AI_ATTACHMENT_IMAGE_INVALID') return '图片格式无效或已损坏，请检查后重新上传。';
  if (code === 'AI_ATTACHMENT_DOC_UNSUPPORTED') return '旧版 DOC 暂不支持，请另存为 DOCX 后上传。';
  if (code?.endsWith('_LIMIT')) return '文件内容超过当前解析上限，请减少内容后重新上传。';
  if (code === 'AI_ATTACHMENT_PARSE_TIMEOUT') return '文件解析超时，请减少内容或稍后重试。';
  if (code && /UNAVAILABLE|PARSER_BUSY|NETWORK_FORBIDDEN/.test(code)) return '当前附件解析服务不可用，请稍后重试。';
  if (code && /INVALID|MISMATCH|BINARY_TEXT/.test(code)) return '文件格式不正确或内容已损坏，请检查后重新上传。';
  return '附件解析失败，请检查文件后重新上传。';
}
const errorText = (cause: unknown) => {
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null;
  return typeof code === 'string' && code.startsWith('AI_ATTACHMENT_') ? parseErrorText(code)
    : cause instanceof Error ? cause.message : '附件操作失败，请重试。';
};
interface UploadTask { file: File; uploadKey: string; conversationId: string | null; mimeType: string; error: string | null; valid: boolean; contentBase64?: string }

export function ConversationAttachmentPicker({ conversationId, ensureConversation, api = conversationAttachmentApi }: {
  conversationId: string | null; ensureConversation(): Promise<string>; api?: ConversationAttachmentApi;
}) {
  const [attachments, setAttachments] = useState<ConversationAttachment[]>([]);
  const [upload, setUpload] = useState<UploadTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ attachmentId: string; detail: ConversationAttachmentPreview; url?: string } | null>(null);
  const previewRef = useRef(preview); previewRef.current = preview;
  const currentConversation = useRef(conversationId); currentConversation.current = conversationId;
  const previousConversation = useRef(conversationId);
  const uploadTask = useRef<UploadTask | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => { return () => { if (preview?.url) URL.revokeObjectURL(preview.url); }; }, [preview]);
  useEffect(() => {
    const previous = previousConversation.current; previousConversation.current = conversationId;
    generation.current++; setAttachments([]); setPreview(null); setError(null);
    // A newly ensured conversation is the upload's own destination, not a navigation away.
    if (!(previous === null && uploadTask.current?.conversationId === conversationId)) {
      uploadTask.current = null; setUpload(null); setBusy(false);
    }
    if (!conversationId) { setLoading(false); return; }
    let active = true; setLoading(true);
    void api.list(conversationId).then(rows => { if (active) setAttachments(previous => {
      const merged = new Map(rows.filter(row => row.storageStatus !== 'removed').map(row => [row.attachmentId, row]));
      for (const row of previous) if (!merged.has(row.attachmentId) || row.revision > merged.get(row.attachmentId)!.revision) merged.set(row.attachmentId, row);
      return [...merged.values()];
    }); })
      .catch(cause => { if (active) setError(errorText(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [conversationId, api]);

  async function sendFile(task: UploadTask) {
    if (busy || !task.valid) return;
    uploadTask.current = task; setUpload(task); setBusy(true); setError(null);
    const isCurrent = () => mounted.current && uploadTask.current === task
      && (currentConversation.current === null || currentConversation.current === task.conversationId);
    try {
      task.conversationId ??= await ensureConversation();
      if (!isCurrent()) return;
      task.contentBase64 ??= await readBase64(task.file);
      if (!isCurrent()) return;
      const attachment = await api.upload(task.conversationId, { uploadKey: task.uploadKey, fileName: task.file.name,
        mimeType: task.mimeType, contentBase64: task.contentBase64 });
      if (!isCurrent()) return;
      if (attachment.storageStatus === 'removed' || attachment.removedAt) {
        setAttachments(rows => rows.filter(row => row.attachmentId !== attachment.attachmentId));
        task.valid = false; task.error = '原上传对应的附件已被移除，请移除待上传文件后重新选择。';
        setUpload({ ...task }); setError(task.error); return;
      }
      setAttachments(rows => [...rows.filter(row => row.attachmentId !== attachment.attachmentId), attachment]);
      uploadTask.current = null; setUpload(null);
    } catch (cause) {
      if (isCurrent()) { task.error = errorText(cause); setUpload({ ...task }); setError(task.error); }
    } finally { if (mounted.current && (uploadTask.current === task || uploadTask.current === null) && (currentConversation.current === null || currentConversation.current === task.conversationId)) setBusy(false); }
  }
  function select(file: File) {
    if (busy || uploadTask.current) return;
    const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
    const mimeType = types[extension];
    const validation = !mimeType ? extension === 'doc' ? '旧版 DOC 暂不支持，请另存为 DOCX 后上传。' : '不支持此文件类型，请选择 TXT、Markdown、PDF、DOCX、PNG 或 JPEG。'
      : !file.size ? '文件为空，请选择有内容的文件。' : file.size > maxBytes ? '单个附件不能超过 5 MB。' : null;
    const task: UploadTask = { file, uploadKey: crypto.randomUUID(), conversationId, mimeType: mimeType ?? file.type, error: validation, valid: !validation };
    uploadTask.current = task; setUpload(task); setError(validation);
    if (task.valid) void sendFile(task);
  }
  function paste(event: ClipboardEvent<HTMLElement>) {
    const image = Array.from(event.clipboardData.items).find(item => item.kind === 'file' && ['image/png', 'image/jpeg'].includes(item.type));
    if (!image || loading || busy || uploadTask.current) return;
    const file = image.getAsFile(); if (!file) return;
    event.preventDefault();
    const name = `粘贴图片.${image.type === 'image/png' ? 'png' : 'jpg'}`;
    select(new File([file], name, { type: image.type }));
  }
  async function perform(work: (id: string, assertCurrent: () => void) => Promise<void>) {
    if (!conversationId || busy) return;
    const captured = generation.current, id = conversationId; setBusy(true); setError(null);
    const assertCurrent = () => { if (!mounted.current || generation.current !== captured || currentConversation.current !== id) throw new Error('对话已变化，请重新操作附件。'); };
    try { await work(id, assertCurrent); }
    catch (cause) { if (mounted.current && generation.current === captured) setError(errorText(cause)); }
    finally { if (mounted.current && generation.current === captured) setBusy(false); }
  }
  return <section className={styles.picker} aria-label="对话附件" tabIndex={0} onPaste={paste}>
    <details><summary>附件（{attachments.length}）</summary>
      <p>已保存到此对话的附件尚未发送给 AI。</p>
      <FileDropField accept={accepted} isDisabled={loading || busy || Boolean(upload)} label="添加对话附件"
        description="TXT、Markdown、PDF、DOCX、PNG、JPEG；单个最多 5 MB。可在此附件区域粘贴 PNG 或 JPEG。"
        onSelect={files => { if (files[0]) select(files[0]); }} />
      {conversationId ? <Button variant="ghost" size="compact" isDisabled={loading || busy} onPress={() => void perform(async (id, assertCurrent) => {
        const rows = await api.list(id); assertCurrent(); setAttachments(rows.filter(row => row.storageStatus !== 'removed'));
      })}>刷新附件</Button> : null}
      {loading ? <p role="status">正在恢复附件…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {upload ? <div className={styles.row}>
        <span>{upload.file.name} · {busy ? '正在保存到此对话…' : '上传未完成；尚未发送给 AI'}</span>
        {!busy && upload.valid ? <Button variant="default" size="compact" onPress={() => void sendFile(uploadTask.current!)}>重试上传</Button> : null}
        <Button variant="ghost" size="compact" isDisabled={busy} onPress={() => { uploadTask.current = null; setUpload(null); setError(null); }}>移除待上传文件</Button>
      </div> : null}
      {attachments.map(attachment => <div className={styles.row} key={attachment.attachmentId}>
        <div><strong>{attachment.fileName}</strong><p>{attachment.storageStatus === 'ready' ? '已保存到此对话；尚未发送给 AI' : '附件内容尚未就绪；尚未发送给 AI'}</p>
          {attachment.parseStatus === 'failed' ? <p>{parseErrorText(attachment.errorCode)}</p>
            : attachment.parseStatus === 'vision_unsupported' || attachment.mimeType.startsWith('image/') ? <p>当前模型尚不支持图片理解。</p>
              : attachment.parseStatus === 'pending' ? <p>文档尚未完成解析。</p> : null}
          {attachment.storageStatus === 'missing' ? <p>附件内容缺失，请移除后重新上传。</p> : null}
        </div>
        <div className={styles.actions}><Button variant="default" size="compact" isDisabled={busy || attachment.storageStatus !== 'ready' || attachment.parseStatus === 'failed'} onPress={() => void perform(async (id, assertCurrent) => {
          const detail = await api.preview(id, attachment.attachmentId); assertCurrent();
          let url: string | undefined;
          if (attachment.mimeType.startsWith('image/')) { const blob = await api.content(id, attachment.attachmentId); assertCurrent(); url = URL.createObjectURL(blob); }
          setPreview({ attachmentId: attachment.attachmentId, detail, url });
        })}>预览 {attachment.fileName}</Button>
          <Button variant="ghost" size="compact" isDisabled={loading || busy} onPress={() => void perform(async (id, assertCurrent) => {
            await api.remove(id, attachment.attachmentId, attachment.revision); assertCurrent();
            setAttachments(rows => rows.filter(row => row.attachmentId !== attachment.attachmentId));
            setPreview(previous => previous?.attachmentId === attachment.attachmentId ? null : previous);
          })}>移除 {attachment.fileName}</Button></div>
      </div>)}
      {preview ? <section className={styles.preview} aria-label="附件预览">
        <strong>{preview.detail.attachment.fileName}</strong>
        {preview.url ? <img src={preview.url} alt={`附件预览：${preview.detail.attachment.fileName}`} onError={() => {
          if (previewRef.current?.url !== preview.url) return;
          setError('图片内容无法显示，可能已损坏。请检查文件后重新上传。'); setPreview(null);
        }} />
          : preview.detail.segments.map((segment, index) => <pre key={index}>{segment.page ? `第 ${segment.page} 页\n` : ''}{segment.text}</pre>)}
        {preview.detail.imageMetadata ? <p>{preview.detail.imageMetadata.width} × {preview.detail.imageMetadata.height} · 当前模型尚不支持图片理解。</p> : null}
        <Button variant="ghost" size="compact" onPress={() => setPreview(null)}>关闭附件预览</Button>
      </section> : null}
    </details>
  </section>;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('读取文件失败，请重新选择。'));
    reader.readAsDataURL(file);
  });
}
