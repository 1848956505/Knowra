import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent
} from 'react';
import type { Folder, Note } from '@study-accelerator/web-core';
import styles from './NoteEditorView.module.css';

export interface EditorDocumentHeaderProps {
  note: Note;
  folder: Folder | null;
  canWrite: boolean;
  onRenameNote(title: string): Promise<void>;
}

export interface EditorDocumentHeaderHandle {
  focusTitle(): void;
}

export const EditorDocumentHeader = forwardRef<EditorDocumentHeaderHandle, EditorDocumentHeaderProps>(
  function EditorDocumentHeader({ note, folder, canWrite, onRenameNote }, ref) {
  const [title, setTitle] = useState(note.title || '无标题笔记');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const ignoreNextBlur = useRef(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focusTitle() {
      if (!canWrite || pending) return;
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }), [canWrite, pending]);

  useEffect(() => {
    setTitle(note.title || '无标题笔记');
    setError('');
  }, [note.id, note.title]);

  async function saveTitle() {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitle(note.title || '无标题笔记');
      setError('标题不能为空，已恢复原标题');
      return;
    }
    setTitle(nextTitle);
    if (!canWrite || nextTitle === note.title || pending) return;
    setPending(true);
    setError('');
    try {
      await onRenameNote(nextTitle);
    } catch (renameError) {
      const cause = renameError instanceof Error && renameError.message ? renameError.message : '标题保存失败';
      setError(`${cause}，请重新编辑或按 Enter 重试`);
    } finally {
      setPending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      ignoreNextBlur.current = true;
      void saveTitle();
      event.currentTarget.blur();
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    ignoreNextBlur.current = true;
    setTitle(note.title || '无标题笔记');
    setError('');
    event.currentTarget.blur();
  }

  const titleErrorId = `note-title-error-${note.id}`;
  return (
    <header>
      <div className={styles.kicker}>
        <span aria-hidden="true" /> NOTE · {(note.status || 'draft').toUpperCase()}
      </div>
      <div className={styles.documentHead}>
        <span className={styles.cover} aria-hidden="true" />
        <div>
          <h1
            id="note-editor-title"
            className={styles.title}
            aria-label={title || '无标题笔记'}
            data-invalid={error || undefined}
          >
            <textarea
              ref={titleRef}
              className={styles.titleInput}
              value={title}
              rows={1}
              name="note-title"
              autoComplete="off"
              spellCheck={false}
              aria-label="笔记标题"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? titleErrorId : undefined}
              readOnly={!canWrite || pending}
              title={canWrite ? '编辑笔记标题；Enter 保存，Esc 撤销' : '后端离线时标题只读'}
              onChange={(event) => {
                setTitle(event.target.value.replace(/[\r\n]+/g, ' '));
                if (error) setError('');
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (ignoreNextBlur.current) {
                  ignoreNextBlur.current = false;
                  return;
                }
                void saveTitle();
              }}
            />
          </h1>
          <p className={styles.meta}>
            <span>{note.status || '文稿'}</span>
            <span>{folder?.name || '未整理'}</span>
            <span>{note.updatedAt ? `更新于 ${formatDate(note.updatedAt)}` : '尚未记录更新时间'}</span>
            {pending ? <span className={styles.titlePending}>保存标题中…</span> : null}
          </p>
          {error ? <p id={titleErrorId} className={styles.titleError} role="alert">{error}</p> : null}
        </div>
      </div>
    </header>
  );
  }
);

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
}
