import { CreateEntryMenu } from './CreateEntryMenu';
import { Button, Menu, MenuItem, MenuPopover, MenuTrigger, Tooltip, TooltipTrigger } from '../../components/ui';
import { PathTrail } from '../../shell/PathTrail';
import type { PathSegment } from '../../shell/path';
import { UploadIcon, ChevronRightIcon, PlusIcon, MoreHorizontalIcon, SettingsIcon, CheckIcon } from '../../components/icons/knowra';
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
      <TooltipTrigger>
        <Button size="workspace" iconOnly aria-label="导入" isDisabled={!canWrite || isRecycleView} onPress={onImport}><UploadIcon size={16} /></Button>
        <Tooltip>导入 Markdown</Tooltip>
      </TooltipTrigger>
      <MenuTrigger>
        <Button size="workspace" iconOnly aria-label="更多操作" aria-pressed={selectionMode}><MoreHorizontalIcon size={16} /></Button>
        <MenuPopover><Menu ariaLabel="更多操作" onAction={key => { if (key === 'spaces') onOpenSpaces(); else onToggleSelection(); }}>
          <MenuItem id="spaces" icon={<SettingsIcon size={14} />}>空间管理</MenuItem>
          <MenuItem id="batch" icon={<CheckIcon size={14} />} isDisabled={!canWrite || isRecycleView}>{selectionMode ? '退出批量管理' : '批量管理'}</MenuItem>
        </Menu></MenuPopover>
      </MenuTrigger>
      <CreateEntryMenu canWrite={canWrite && !isRecycleView} onCreate={onCreate}><Button size="workspace" variant="accent" isDisabled={!canWrite || isRecycleView}><PlusIcon size={17} />新建</Button></CreateEntryMenu>
    </>}
  />;
}
