import { MenuItem, MenuSeparator } from '../../components/ui/overlay';
import type { EditorCommand } from './editorCommands';
import { getEditorShortcutLabel } from './editorShortcuts';

export function renderEditorFormatMenu({ onCommand, onInsertImage }: {
  onCommand(command: EditorCommand): void;
  onInsertImage(): void;
}) {
  const command = (value: EditorCommand) => () => onCommand(value);
  return (
    <>
      <MenuItem id="image" onAction={onInsertImage}>图片</MenuItem>
      <MenuItem id="internal-link" onAction={command('internal-link')}>内部链接</MenuItem>
      <MenuSeparator />
      <MenuItem id="bold" kbd={getEditorShortcutLabel('bold')} onAction={command('bold')}>加粗</MenuItem>
      <MenuItem id="italic" onAction={command('italic')}>斜体</MenuItem>
      <MenuItem id="strikethrough" onAction={command('strikethrough')}>删除线</MenuItem>
      <MenuItem id="inline-code" kbd={getEditorShortcutLabel('inline-code')} onAction={command('inline-code')}>行内代码</MenuItem>
      <MenuItem id="highlight" kbd={getEditorShortcutLabel('highlight')} onAction={command('highlight')}>高亮</MenuItem>
    </>
  );
}
