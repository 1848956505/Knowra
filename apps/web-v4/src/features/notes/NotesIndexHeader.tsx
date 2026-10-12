import { CreateEntryMenu } from './CreateEntryMenu';
import { Button, Menu, MenuItem, MenuPopover, MenuTrigger, Tooltip, TooltipTrigger } from '../../components/ui';
import { PathTrail } from '../../shell/PathTrail';
import type { PathSegment } from '../../shell/path';
import { UploadIcon, PlusIcon, MoreHorizontalIcon, SettingsIcon, CheckIcon } from '../../components/icons/knowra';
import { WorkspacePanelHeader } from '../../components/workspace/WorkspacePanel';

export function NotesIndexHeader({ path, canWrite, isRecycleView, selectionMode, onToggleSelection, onImport, onCreate, onOpenSpaces }: {
  path: PathSegment[]; canWrite: boolean; isRecycleView: boolean; selectionMode: boolean;
  onToggleSelection(): void; onImport(): void; onCreate(mode: 'note' | 'folder'): void; onOpenSpaces(): void;
}) {
  return <WorkspacePanelHeader title="笔记索引" code="INDEX" breadcrumb={<PathTrail path={path} variant="top" />}
    breadcrumbTitle={path.map(segment => segment.label).join(' / ')} actionsLabel="笔记操作"
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
