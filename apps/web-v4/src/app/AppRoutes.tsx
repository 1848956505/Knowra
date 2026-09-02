import { lazy, Suspense, useEffect, useState } from 'react';
import type { PathSegment } from '../shell/path';
import { useNavigate } from './router';
import { useAppStore } from '../store/AppStoreProvider';
import { LoadingState } from '../components/ui/status';
import { NoteEditorView } from '../features/editor';
import {
  CreateEntryDialog,
  DeleteTreeEntryDialog,
  NotesIndexView,
  type CreateMode
} from '../features/notes';
import { MarkdownImportDialog } from '../features/editor/MarkdownImportDialog';
import type { EditorViewAction, EffectiveEditorViewState } from '../features/editor/editorViewState';
import { HomeView } from '../views/HomeView';
import { PlaceholderView } from '../views/PlaceholderView';
import type { WorkDomain } from '../store/types';

const ComponentShowcase = lazy(async () => {
  const module = await import('../components/ui/showcase');
  return { default: module.ComponentShowcase };
});

export interface DomainDescriptor {
  title: string;
  description: string;
}

export const DOMAIN_INFO: Record<WorkDomain, DomainDescriptor> = {
  materials: { title: '资料工作区', description: '按目录组织 Markdown 笔记，用标签串联主题。' },
  knowledge: { title: '知识库', description: '知识单元与学习目标管理（V4-08 接入）。' },
  training: { title: '试题库', description: '题目库与考试场景（V4-08 接入）。' },
  learning: { title: '执行', description: '待办、打卡与习惯追踪（V4-08 接入）。' },
  profile: { title: '我的', description: '工作区与个人设置。' }
};

export interface AppRoutesProps {
  pathname: string;
  routeDomain: WorkDomain;
  statusPath: PathSegment[];
  editorNoteId: string | null;
  editorView: EffectiveEditorViewState;
  canWrite: boolean;
  onRetry(): Promise<void>;
  onEditorViewAction(action: EditorViewAction): void;
  onOpenNote(noteId: string): void;
  onSelectNote(noteId: string, title: string): void;
  onOpenMaterials(): void;
  onOpenSearch(): void;
  onOpenCreate(): void;
  onOpenSchedule(): void;
}

export function AppRoutes(props: AppRoutesProps) {
  if (props.pathname === '/showcase') {
    return <Suspense fallback={<LoadingState label="正在加载组件展台…" />}><ComponentShowcase /></Suspense>;
  }
  if (props.routeDomain !== 'materials') return <PlaceholderStage domain={props.routeDomain} />;
  if (props.pathname === '/materials') {
    return <NotesIndexView path={props.statusPath} onOpenNote={props.onOpenNote} />;
  }
  if (props.editorNoteId) {
    return (
      <NoteEditorStage
        noteId={props.editorNoteId}
        editorView={props.editorView}
        canWrite={props.canWrite}
        onEditorViewAction={props.onEditorViewAction}
        onOpenNote={props.onOpenNote}
      />
    );
  }
  return (
    <HomeStage
      onRetry={props.onRetry}
      canWrite={props.canWrite}
      onSelectNote={props.onSelectNote}
      onOpenMaterials={props.onOpenMaterials}
      onOpenSearch={props.onOpenSearch}
      onOpenCreate={props.onOpenCreate}
      onOpenSchedule={props.onOpenSchedule}
    />
  );
}

function NoteEditorStage({ noteId, editorView, canWrite, onEditorViewAction, onOpenNote }: {
  noteId: string;
  editorView: EffectiveEditorViewState;
  canWrite: boolean;
  onEditorViewAction(action: EditorViewAction): void;
  onOpenNote(noteId: string): void;
}) {
  const serverData = useAppStore((state) => state.serverData);
  const navigation = useAppStore((state) => state.navigation);
  const selectNote = useAppStore((state) => state.selectNote);
  const closeNoteTab = useAppStore((state) => state.closeNoteTab);
  const closeOtherNoteTabs = useAppStore((state) => state.closeOtherNoteTabs);
  const reorderNoteTabs = useAppStore((state) => state.reorderNoteTabs);
  const createNote = useAppStore((state) => state.createNote);
  const duplicateNote = useAppStore((state) => state.duplicateNote);
  const importMarkdownNotes = useAppStore((state) => state.importMarkdownNotes);
  const createFolder = useAppStore((state) => state.createFolder);
  const renameNote = useAppStore((state) => state.renameNote);
  const loadNoteContent = useAppStore((state) => state.loadNoteContent);
  const saveNoteContent = useAppStore((state) => state.saveNoteContent);
  const deleteNote = useAppStore((state) => state.deleteNote);
  const setNoteFavorite = useAppStore((state) => state.setNoteFavorite);
  const setNoteTags = useAppStore((state) => state.setNoteTags);
  const listNoteVersions = useAppStore((state) => state.listNoteVersions);
  const getNoteVersion = useAppStore((state) => state.getNoteVersion);
  const organizeNote = useAppStore((state) => state.organizeNote);
  const listNoteAttachments = useAppStore((state) => state.listNoteAttachments);
  const uploadNoteAttachment = useAppStore((state) => state.uploadNoteAttachment);
  const renameNoteAttachment = useAppStore((state) => state.renameNoteAttachment);
  const deleteNoteAttachment = useAppStore((state) => state.deleteNoteAttachment);
  const getLinkedNotes = useAppStore((state) => state.getLinkedNotes);
  const listAnnotations = useAppStore((state) => state.listAnnotations);
  const createAnnotation = useAppStore((state) => state.createAnnotation);
  const deleteAnnotation = useAppStore((state) => state.deleteAnnotation);
  const restoreAnnotation = useAppStore((state) => state.restoreAnnotation);
  const updateAnnotationAnchor = useAppStore((state) => state.updateAnnotationAnchor);
  const setStatusMessage = useAppStore((state) => state.setStatusMessage);
  const navigate = useNavigate();
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const note = serverData.notes.find((item) => item.id === noteId && !item.deleted) ?? null;
  const folder = note?.folderId ? serverData.foldersById[note.folderId] ?? null : null;
  const openNotes = navigation.openNoteTabs
    .map((id) => serverData.notes.find((item) => item.id === id && !item.deleted))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  useEffect(() => {
    if (note && navigation.selectedNoteId !== note.id) selectNote(note.id);
  }, [navigation.selectedNoteId, note, selectNote]);

  useEffect(() => {
    if (note && !note.contentLoaded) void loadNoteContent(note.id).catch(() => undefined);
  }, [loadNoteContent, note]);

  return (
    <>
      <NoteEditorView
        note={note}
        folder={folder}
        foldersById={serverData.foldersById}
        notes={serverData.notes}
        tags={serverData.tags}
        openNotes={openNotes}
        inspectorOpen={editorView.showRightSidebar}
        view={editorView}
        canWrite={canWrite}
        favoritePending={favoritePending}
        onToggleInspector={() => onEditorViewAction('toggle-right-sidebar')}
        onViewAction={onEditorViewAction}
        onOpenNote={onOpenNote}
        onCloseNote={(closingNoteId) => {
          const nextNoteId = closeNoteTab(closingNoteId);
          if (closingNoteId !== note?.id) return;
          if (nextNoteId) onOpenNote(nextNoteId);
          else navigate('/materials');
        }}
        onCloseOtherNotes={(remainingNoteId) => {
          closeOtherNoteTabs(remainingNoteId);
          onOpenNote(remainingNoteId);
        }}
        onReorderNotes={reorderNoteTabs}
        onCopyTabPath={(tabNote) => {
          const tabFolder = tabNote.folderId ? serverData.foldersById[tabNote.folderId] : null;
          const path = [tabFolder?.name, tabNote.title || '无标题笔记'].filter(Boolean).join(' / ');
          void navigator.clipboard.writeText(path)
            .then(() => setStatusMessage(`已复制路径：${path}`))
            .catch(() => setStatusMessage('复制路径失败，请检查剪贴板权限'));
        }}
        onCreateNote={() => setCreateMode('note')}
        onCreateFolder={() => setCreateMode('folder')}
        onImportMarkdown={() => setImportOpen(true)}
        onRenameNote={(title) => note ? renameNote(note.id, title) : Promise.resolve()}
        onSaveMarkdown={(targetNoteId, markdown, expectedUpdatedAt) => (
          saveNoteContent(targetNoteId, markdown, expectedUpdatedAt)
        )}
        onSaveAs={async () => {
          if (!note) return;
          const createdId = await duplicateNote(note.id);
          onOpenNote(createdId);
        }}
        onDeleteNote={() => setDeleteOpen(true)}
        onSetTags={(tagIds) => note ? setNoteTags(note.id, tagIds) : Promise.resolve()}
        onListVersions={listNoteVersions}
        onGetVersion={getNoteVersion}
        onOrganizeNote={(input) => note ? organizeNote(note.id, input) : Promise.resolve()}
        onListAttachments={listNoteAttachments}
        onUploadAttachment={uploadNoteAttachment}
        onRenameAttachment={renameNoteAttachment}
        onDeleteAttachment={deleteNoteAttachment}
        onGetLinkedNotes={getLinkedNotes}
        onListAnnotations={listAnnotations}
        onCreateAnnotation={createAnnotation}
        onDeleteAnnotation={deleteAnnotation}
        onRestoreAnnotation={restoreAnnotation}
        onUpdateAnnotationAnchor={updateAnnotationAnchor}
        onFileStatus={setStatusMessage}
        onToggleFavorite={() => {
          if (!note || favoritePending) return;
          setFavoritePending(true);
          void setNoteFavorite(note.id, !note.favorite)
            .catch(() => undefined)
            .finally(() => setFavoritePending(false));
        }}
      />
      <CreateEntryDialog
        mode={createMode}
        parentFolderId={folder?.id ?? null}
        onOpenChange={(open) => { if (!open) setCreateMode(null); }}
        onCreateNote={async (folderId, title) => {
          const createdId = await createNote(folderId, title);
          onOpenNote(createdId);
          return createdId;
        }}
        onCreateFolder={createFolder}
      />
      <MarkdownImportDialog
        isOpen={importOpen}
        folderName={folder?.name ?? '未整理'}
        onOpenChange={setImportOpen}
        onImport={async (sources) => {
          const result = await importMarkdownNotes(folder?.id ?? null, sources);
          onOpenNote(result.firstNoteId);
        }}
      />
      {note && deleteOpen ? (
        <DeleteTreeEntryDialog
          target={{ kind: 'note', id: note.id, name: note.title || '无标题笔记' }}
          onClose={() => setDeleteOpen(false)}
          onDelete={async () => {
            await deleteNote(note.id);
            navigate('/materials');
          }}
        />
      ) : null}
    </>
  );
}

function HomeStage({ onRetry, canWrite, onSelectNote, onOpenMaterials, onOpenSearch, onOpenCreate, onOpenSchedule }: {
  onRetry(): Promise<void>;
  canWrite: boolean;
  onSelectNote(noteId: string, title: string): void;
  onOpenMaterials(): void;
  onOpenSearch(): void;
  onOpenCreate(): void;
  onOpenSchedule(): void;
}) {
  const loadState = useAppStore((state) => state.workspaceLoadState);
  const error = useAppStore((state) => state.workspaceError);
  const dataMode = useAppStore((state) => state.dataMode);
  const serverData = useAppStore((state) => state.serverData);
  return (
    <HomeView
      loadState={loadState}
      error={error}
      dataMode={dataMode}
      notes={serverData.notes}
      folders={Object.values(serverData.foldersById)}
      tags={serverData.tags}
      isWritable={canWrite}
      onRetry={() => void onRetry()}
      onOpenMaterials={onOpenMaterials}
      onOpenSearch={onOpenSearch}
      onOpenCreate={onOpenCreate}
      onOpenSchedule={onOpenSchedule}
      onSelectNote={onSelectNote}
    />
  );
}

function PlaceholderStage({ domain }: { domain: WorkDomain }) {
  const setActiveWorkDomain = useAppStore((state) => state.setActiveWorkDomain);
  const navigate = useNavigate();
  return (
    <PlaceholderView
      moduleId={domain}
      title={DOMAIN_INFO[domain].title}
      description={DOMAIN_INFO[domain].description}
      onReturnHome={() => {
        setActiveWorkDomain('materials');
        navigate('/');
      }}
    />
  );
}
