import type { ReactNode, Ref } from 'react';
import { PressableButton } from '../../components/ui/button';
import { Menu, MenuItem, MenuPopover, MenuTrigger } from '../../components/ui/overlay';
import {
  CodeIcon, ImageIcon, ListIcon, MoreVerticalIcon, PanelIcon, PlusIcon,
  QuoteIcon, StarIcon, TableIcon
} from '../../shell/icons';
import type { EditorCommand } from './editorCommands';
import type { EditorFileAction } from './editorCommands';
import { renderEditorFileMenu } from './EditorFileMenu';
import { renderEditorEditMenu } from './EditorEditMenu';
import { renderEditorFormatMenu } from './EditorFormatMenu';
import { renderEditorParagraphMenu } from './EditorParagraphMenu';
import { renderEditorViewMenu } from './EditorViewMenu';
import type { EditorEditAction } from './editorCommands';
import type { EditorViewAction, EffectiveEditorViewState } from './editorViewState';
import styles from './NoteEditorView.module.css';

export interface EditorToolbarProps {
  toolbarRef: Ref<HTMLDivElement>;
  pinned: boolean;
  favorite: boolean;
  favoritePending: boolean;
  canWrite: boolean;
  canEditContent: boolean;
  inspectorOpen: boolean;
  view: EffectiveEditorViewState;
  onRunCommand(command: EditorCommand): void;
  onEditAction(action: EditorEditAction): void;
  onViewAction(action: EditorViewAction): void;
  onFileAction(action: EditorFileAction): void;
  onToggleFavorite(): void;
  onToggleInspector(): void;
  onInsertImage(): void;
}

export function EditorToolbar(props: EditorToolbarProps) {
  const command = (value: EditorCommand) => () => props.onRunCommand(value);
  return (
    <div ref={props.toolbarRef} className={styles.toolbar} data-pdf-exclude="true" data-pinned={props.pinned || undefined} role="toolbar" aria-label="笔记格式工具栏">
      <div className={styles.toolbarMenus} aria-label="编辑器菜单">
        <ToolbarMenu label="文件">{renderEditorFileMenu({
          canWrite: props.canWrite,
          favorite: props.favorite,
          onAction: props.onFileAction
        })}</ToolbarMenu>
        <ToolbarMenu label="段落" disabled={!props.canEditContent}>
          {renderEditorParagraphMenu({ onCommand: props.onRunCommand })}
        </ToolbarMenu>
        <ToolbarMenu label="编辑">
          {renderEditorEditMenu({ canWrite: props.canEditContent, onAction: props.onEditAction })}
        </ToolbarMenu>
        <ToolbarMenu label="格式" disabled={!props.canEditContent}>
          {renderEditorFormatMenu({ onCommand: props.onRunCommand, onInsertImage: props.onInsertImage })}
        </ToolbarMenu>
        <ToolbarMenu label="视图">{renderEditorViewMenu({ view: props.view, onAction: props.onViewAction })}</ToolbarMenu>
      </div>
      <span className={styles.separator} aria-hidden="true" />
      <FormatButton label="一级标题" disabled={!props.canEditContent} onPress={command('heading-1')}><strong>H1</strong></FormatButton>
      <FormatButton label="二级标题" disabled={!props.canEditContent} onPress={command('heading-2')}><strong>H2</strong></FormatButton>
      <FormatButton label="三级标题" disabled={!props.canEditContent} onPress={command('heading-3')}><strong>H3</strong></FormatButton>
      <span className={styles.separator} aria-hidden="true" />
      <FormatButton label="加粗" disabled={!props.canEditContent} onPress={command('bold')}><strong>B</strong></FormatButton>
      <FormatButton label="斜体" disabled={!props.canEditContent} onPress={command('italic')}><em>I</em></FormatButton>
      <FormatButton label="行内代码" disabled={!props.canEditContent} onPress={command('inline-code')}><CodeIcon size={16} /></FormatButton>
      <span className={styles.separator} aria-hidden="true" />
      <FormatButton label="无序列表" disabled={!props.canEditContent} onPress={command('bullet-list')}><ListIcon size={16} /></FormatButton>
      <FormatButton label="引用" disabled={!props.canEditContent} onPress={command('blockquote')}><QuoteIcon size={16} /></FormatButton>
      <FormatButton label="插入表格" optional disabled={!props.canEditContent} onPress={command('table')}><TableIcon size={16} /></FormatButton>
      <FormatButton label="插入图片" optional disabled={!props.canEditContent} onPress={props.onInsertImage}><ImageIcon size={16} /></FormatButton>
      <span className={styles.toolbarSpacer} />
      <span className={styles.separator} aria-hidden="true" />
      <button type="button" className={styles.plainButton} aria-label={props.favorite ? '取消收藏当前笔记' : '收藏当前笔记'} aria-pressed={props.favorite} disabled={!props.canWrite || props.favoritePending} onClick={props.onToggleFavorite}><StarIcon size={16} /></button>
      <MenuTrigger>
        <PressableButton className={styles.plainButton} aria-label="打开插入菜单"><PlusIcon size={16} /></PressableButton>
        <MenuPopover placement="bottom end"><Menu ariaLabel="插入菜单"><MenuItem id="table" isDisabled={!props.canEditContent} onAction={command('table')}>插入 3×3 表格</MenuItem><MenuItem id="image" isDisabled={!props.canEditContent} onAction={props.onInsertImage}>插入图片</MenuItem></Menu></MenuPopover>
      </MenuTrigger>
      <button type="button" className={styles.plainButton} aria-label="切换文档检查器" aria-pressed={props.inspectorOpen} onClick={props.onToggleInspector}><PanelIcon size={16} /></button>
      <button type="button" className={styles.plainButton} aria-label="更多文档操作（尚未接入）" title="更多文档操作将在后续接入" disabled><MoreVerticalIcon size={16} /></button>
    </div>
  );
}

function ToolbarMenu({ label, children, disabled = false }: { label: string; children: ReactNode; disabled?: boolean }) {
  return <MenuTrigger><PressableButton isDisabled={disabled}>{label}</PressableButton><MenuPopover><Menu ariaLabel={`${label}菜单`}>{children}</Menu></MenuPopover></MenuTrigger>;
}

function FormatButton({ label, optional = false, disabled = false, title, onPress, children }: {
  label: string; optional?: boolean; disabled?: boolean; title?: string; onPress?(): void; children: ReactNode;
}) {
  return <button type="button" className={optional ? styles.optionalTool : undefined} aria-label={label} title={title || label} disabled={disabled} onClick={onPress}>{children}</button>;
}
