import { CreateEntryMenu } from './CreateEntryMenu';
import { Button } from '../../components/ui';
import { PathTrail } from '../../shell/PathTrail';
import type { PathSegment } from '../../shell/path';
import { UploadIcon, ChevronRightIcon, PlusIcon } from '../../shell/icons';
import { useLocation } from '../../app/router';
import { WorkspacePanelHeader } from '../../components/workspace/WorkspacePanel';
import styles from './NotesIndexView.module.css';

export function NotesIndexHeader({ path, canWrite, isRecycleView, selectionMode, onToggleSelection, onImport, onCreate, onOpenSpaces }: {
  path: PathSegment[]; canWrite: boolean; isRecycleView: boolean; selectionMode: boolean;
  onToggleSelection(): void; onImport(): void; onCreate(mode: 'note' | 'folder'): void; onOpenSpaces(): void;
}) {
  const history = useLocation();
  return <WorkspacePanelHeader title="笔记索引" code="INDEX" breadcrumb={<PathTrail path={path} variant="top" />}
    breadcrumbTitle={path.map(segment => segment.label).join(' / ')} actionsLabel="笔记操作"
    history={<div className={styles.history} role="group" aria-label="浏览历史">
      <Button size="workspace" aria-label="后退" isDisabled={!history.canGoBack} onPress={history.back}><span className={styles.backArrow}><ChevronRightIcon size={16} /></span></Button>
      <Button size="workspace" aria-label="前进" isDisabled={!history.canGoForward} onPress={history.forward}><ChevronRightIcon size={16} /></Button>
    </div>}
    actions={<>
      <Button size="workspace" onPress={onOpenSpaces}>空间管理</Button>
      <Button size="workspace" isDisabled={!canWrite || isRecycleView} aria-pressed={selectionMode} onPress={onToggleSelection}>批量管理</Button>
      <Button size="workspace" isDisabled={!canWrite || isRecycleView} onPress={onImport}><UploadIcon size={16} />导入</Button>
      <CreateEntryMenu canWrite={canWrite && !isRecycleView} onCreate={onCreate}><Button size="workspace" variant="accent" isDisabled={!canWrite || isRecycleView}><PlusIcon size={17} />新建</Button></CreateEntryMenu>
    </>}
  />;
}
