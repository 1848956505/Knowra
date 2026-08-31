import { Fragment } from 'react';
import { MenuItem, MenuSeparator } from '../../components/ui';
import type { EditorEditAction } from './editorCommands';

export interface EditorEditMenuProps {
  canWrite: boolean;
  onAction(action: EditorEditAction): void;
}

const groups: Array<Array<{ action: EditorEditAction; label: string; kbd?: string; requiresWrite?: boolean }>> = [
  [
    { action: 'undo', label: '撤销', kbd: 'Ctrl+Z', requiresWrite: true },
    { action: 'redo', label: '重做', kbd: 'Ctrl+Y', requiresWrite: true }
  ],
  [
    { action: 'cut', label: '剪切', requiresWrite: true },
    { action: 'copy', label: '复制', kbd: 'Ctrl+C' },
    { action: 'paste', label: '粘贴', kbd: 'Ctrl+V', requiresWrite: true }
  ],
  [
    { action: 'find', label: '查找' },
    { action: 'replace', label: '替换', requiresWrite: true },
    { action: 'select-all', label: '全选', kbd: 'Ctrl+A' }
  ],
  [
    { action: 'repair-document', label: '检查异常格式', requiresWrite: true }
  ]
];

export function renderEditorEditMenu({ canWrite, onAction }: EditorEditMenuProps) {
  return groups.map((items, groupIndex) => (
    <Fragment key={items[0].action}>
      {groupIndex > 0 ? <MenuSeparator /> : null}
      {items.map((item) => (
        <MenuItem
          key={item.action}
          id={item.action}
          aria-label={item.label}
          kbd={item.kbd}
          isDisabled={item.requiresWrite && !canWrite}
          onAction={() => onAction(item.action)}
        >
          {item.label}
        </MenuItem>
      ))}
    </Fragment>
  ));
}
