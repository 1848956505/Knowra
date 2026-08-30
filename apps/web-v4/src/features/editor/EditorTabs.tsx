import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { Note } from '@study-accelerator/web-core';
import { PressableButton } from '../../components/ui/button';
import { Menu, MenuItem, MenuPopover, MenuSeparator, MenuTrigger } from '../../components/ui/overlay';
import { CloseIcon, MoreVerticalIcon, PlusIcon } from '../../shell/icons';
import styles from './NoteEditorView.module.css';

export interface EditorTabsProps {
  notes: Note[];
  activeNoteId: string;
  canWrite: boolean;
  onOpenNote(noteId: string): void;
  onCloseNote(noteId: string): void;
  onCloseOtherNotes(noteId: string): void;
  onReorderNotes(sourceNoteId: string, targetNoteId: string): void;
  onCopyTabPath(note: Note): void;
  onCreateNote(): void;
}

export function EditorTabs(props: EditorTabsProps) {
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    if (tabs.length === 0) return;
    const current = Math.max(0, tabs.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  }

  function handleDrop(event: DragEvent, targetNoteId: string) {
    event.preventDefault();
    const sourceNoteId = draggedNoteId || event.dataTransfer.getData('text/x-note-id');
    setDraggedNoteId(null);
    if (sourceNoteId) props.onReorderNotes(sourceNoteId, targetNoteId);
  }

  return (
    <div className={styles.tabs} role="tablist" aria-label="打开的笔记" onKeyDown={handleKeyDown}>
      <div className={styles.tabScroller}>
        {props.notes.map((note, index) => {
          const selected = note.id === props.activeNoteId;
          return (
            <div
              key={note.id}
              className={styles.tabItem}
              data-selected={selected || undefined}
              draggable
              onDragStart={(event) => {
                setDraggedNoteId(note.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/x-note-id', note.id);
              }}
              onDragEnd={() => setDraggedNoteId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, note.id)}
            >
              <TabContextMenu note={note} noteIndex={index} {...props}>
                <PressableButton
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={note.title || '无标题笔记'}
                  tabIndex={selected ? 0 : -1}
                  className={styles.tab}
                  title={`${String(index + 1).padStart(2, '0')} · ${note.title || '无标题笔记'}`}
                  onPress={() => props.onOpenNote(note.id)}
                >
                  <span className={styles.tabNumber}>{String(index + 1).padStart(2, '0')}</span>
                  <span className={styles.tabLabel}>{note.title || '无标题笔记'}</span>
                </PressableButton>
              </TabContextMenu>
              <button type="button" className={styles.tabClose} aria-label={`关闭${note.title || '无标题笔记'}`} onClick={() => props.onCloseNote(note.id)}>
                <CloseIcon size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <MenuTrigger>
        <PressableButton className={styles.tabOverflow} aria-label="查看全部标签页"><MoreVerticalIcon size={15} /></PressableButton>
        <MenuPopover placement="bottom end">
          <Menu ariaLabel="全部标签页">
            {props.notes.map((note, index) => (
              <MenuItem key={note.id} id={note.id} onAction={() => props.onOpenNote(note.id)}>
                {String(index + 1).padStart(2, '0')} · {note.title || '无标题笔记'}
              </MenuItem>
            ))}
          </Menu>
        </MenuPopover>
      </MenuTrigger>
      <button type="button" className={styles.addTab} aria-label="新建笔记" title={props.canWrite ? '新建笔记' : '后端离线时无法新建'} disabled={!props.canWrite} onClick={props.onCreateNote}>
        <PlusIcon size={15} />
      </button>
    </div>
  );
}

function TabContextMenu({ note, noteIndex, notes, children, onCloseNote, onCloseOtherNotes, onCopyTabPath, onReorderNotes }: EditorTabsProps & {
  note: Note;
  noteIndex: number;
  children: ReactNode;
}) {
  return (
    <MenuTrigger trigger="contextMenu">
      {children}
      <MenuPopover>
        <Menu ariaLabel={`${note.title || '无标题笔记'}标签操作`}>
          <MenuItem id="copy-path" onAction={() => onCopyTabPath(note)}>复制笔记路径</MenuItem>
          <MenuSeparator />
          <MenuItem id="move-left" isDisabled={noteIndex === 0} onAction={() => onReorderNotes(note.id, notes[noteIndex - 1]?.id ?? note.id)}>向左移动标签</MenuItem>
          <MenuItem id="move-right" isDisabled={noteIndex === notes.length - 1} onAction={() => onReorderNotes(note.id, notes[noteIndex + 1]?.id ?? note.id)}>向右移动标签</MenuItem>
          <MenuSeparator />
          <MenuItem id="close" onAction={() => onCloseNote(note.id)}>关闭标签页</MenuItem>
          <MenuItem id="close-others" isDisabled={notes.length < 2} onAction={() => onCloseOtherNotes(note.id)}>关闭其他标签页</MenuItem>
        </Menu>
      </MenuPopover>
    </MenuTrigger>
  );
}
