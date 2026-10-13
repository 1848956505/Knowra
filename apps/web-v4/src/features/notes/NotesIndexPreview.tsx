import { Button } from '../../components/ui';
import { MathText } from '../../components/math/MathText';
import { CloseIcon, FolderIcon, NoteIcon, PanelIcon } from '../../components/icons/knowra';
import { folderLocation, displayNoteStatus } from './notesIndexNavigation';
import { formatUpdatedAt, countFolderNotes } from './notesIndexModel';
import type { NotesIndexController } from './useNotesIndexController';
import styles from './NotesIndexView.module.css';

/** 只读索引元数据预览；完整正文和权限继续交给既有编辑页。 */
export function NotesIndexPreview({ c }: { c: NotesIndexController }) {
  const item = c.peekItem;
  const title = item?.kind === 'note' ? item.note.title || '未命名笔记' : item?.folder.name;
  return <aside className={styles.peek} aria-label="笔记预览">
    <header className={styles.peekHeader}><PanelIcon size={15} /><span>预览</span><span className={styles.toolbarSpacer} />
      <Button variant="ghost" size="workspace" iconOnly aria-label="关闭预览栏" onPress={() => c.setPeekOpen(false)}><CloseIcon size={15} /></Button></header>
    {item ? <div className={styles.peekBody}>
      <div className={styles.peekSymbol} aria-hidden="true">{item.kind === 'folder' ? <FolderIcon size={38} /> : <NoteIcon size={38} />}</div>
      <p className={styles.peekLocation}>{folderLocation(item.kind === 'folder' ? item.folder.parentId : item.note.folderId, c.serverData.foldersById)}</p>
      <h2>{title}</h2>
      <dl className={styles.previewDetails}>
        <dt>类型</dt><dd>{item.kind === 'folder' ? '文件夹' : '笔记'}</dd>
        <dt>最近更新</dt><dd>{formatUpdatedAt(item.kind === 'folder' ? item.folder.updatedAt : item.note.updatedAt)}</dd>
        {item.kind === 'note' ? <><dt>状态</dt><dd>{displayNoteStatus(item.note.status)}</dd>
          <dt>标签</dt><dd>{item.note.tagIds.map(id => c.serverData.tags.find(tag => tag.id === id)?.name).filter(Boolean).join(' · ') || '无标签'}</dd></> : null}
      </dl>
      <h3>{item.kind === 'folder' ? '目录内容' : '摘要'}</h3>
      <p className={styles.peekSummary}>{item.kind === 'folder' ? `${countFolderNotes(item.folder, c.serverData.notes)} 篇已加载笔记（含子目录）` : (typeof item.note.summary === 'string' && item.note.summary ? <MathText text={item.note.summary} inlineOnly /> : '暂无摘要，打开笔记查看完整内容。')}</p>
      {item.kind === 'note' && item.note.deleted ? <p className={styles.optionHint}>笔记已在回收站，请先恢复。</p> : <Button size="compact" variant="accent"
        onPress={() => item.kind === 'folder' ? c.selectFolder(item.folder.id) : c.openNote(item.note.id)}>打开{item.kind === 'folder' ? '文件夹' : '笔记'}</Button>}
    </div> : <div className={styles.peekEmpty}><PanelIcon size={26} /><strong>选择一项以预览</strong><p>开启预览后，单击笔记或目录查看信息，使用“打开”继续。</p></div>}
  </aside>;
}
