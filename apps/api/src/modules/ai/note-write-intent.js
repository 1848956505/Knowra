import { actionError } from './action-state.js';
import organizeParameters from './contracts/note-organize-v1.schema.json' with { type: 'json' };
import { NOTE_WRITE_TOOLS } from './note-plan.js';
export function validateWriteIntent(input) {
  if (!input || Object.keys(input).some(key => !['toolName','noteId'].includes(key))
    || !['notes_create','notes_append','notes_propose_patch','notes_propose_organize'].includes(input.toolName)
    || input.toolName === 'notes_create' && input.noteId !== undefined
    || input.toolName !== 'notes_create' && (typeof input.noteId !== 'string' || !input.noteId || input.noteId.length > 128)) {
    actionError('AI_REQUEST_INVALID', '写入意图必须指定明确工具与固定目标。', 422);
  }
  return structuredClone(input);
}
export function toolsForWriteIntent(intent) {
  const valid = validateWriteIntent(intent);
  return [...NOTE_WRITE_TOOLS, { name: 'notes_propose_organize', toolVersion: 1, description: '为固定目标提出改名、移动或标签整理；不修改正文。', parameters: organizeParameters }].filter(tool => tool.name === valid.toolName).map(({toolVersion, ...tool}) => ({...tool,
    description: `${tool.description} ${valid.noteId ? `唯一目标 ID：${valid.noteId}。` : ''}仅提出计划，禁止宣称已经保存。`}));
}
