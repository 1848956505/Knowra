import { createTaskMcpTools } from './task-tools.mjs';
import { TASK_IMAGE_MAX_BYTES } from './task-output.mjs';
import { mcpError } from './mcp-error.mjs';
const names = new Set(Object.keys(createTaskMcpTools()));
const invalid = () => { throw mcpError('MCP_RESULT_INVALID', '任务协议响应无效。', { status: 502 }); };
const only = (value, keys) => value && typeof value === 'object' && Object.keys(value).every(key => keys.includes(key));

/** socket响应只在已知任务工具上转换为标准MCP content，不允许普通知识工具借此绕过正文出口。 */
export function taskAdapterResult(name, result) {
  if (!names.has(name)) {
    if (result?.taskContent !== undefined) invalid();
    return null;
  }
  if (!only(result, ['taskContent']) || !Array.isArray(result.taskContent)) invalid();
  const content = result.taskContent;
  const text = item => only(item, ['type', 'text']) && item.type === 'text' && typeof item.text === 'string';
  if (name === 'task_images_read') {
    const [image, metadata] = content;
    if (content.length !== 2 || !only(image, ['type', 'data', 'mimeType']) || image.type !== 'image'
      || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType) || typeof image.data !== 'string'
      || image.data.length > Math.ceil(TASK_IMAGE_MAX_BYTES / 3) * 4
      || image.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)
      || !image.data.length || Buffer.byteLength(image.data, 'base64') > TASK_IMAGE_MAX_BYTES
      || !text(metadata) || Buffer.byteLength(metadata.text, 'utf8') > 4096) invalid();
  } else if (content.length !== 1 || !text(content[0]) || Buffer.byteLength(JSON.stringify({ content }), 'utf8') > 131072) invalid();
  return { content };
}
