import { useLayoutEffect, useRef, useState, type Key, type ReactElement } from 'react';
import { PressableButton } from '../../components/ui/button';
import {
  Menu,
  MenuHeader,
  MenuItem,
  MenuPopover,
  MenuSection,
  MenuSeparator,
  MenuTrigger,
  SubmenuTrigger
} from '../../components/ui/overlay';
import {
  BoldIcon,
  CodeIcon,
  CopyIcon,
  CutIcon,
  DeleteIcon,
  HighlightIcon,
  HorizontalRuleIcon,
  ImageIcon,
  IndentIcon,
  ItalicIcon,
  ListIcon,
  OrderedListIcon,
  OutdentIcon,
  ParagraphAddIcon,
  PasteIcon,
  QuoteIcon,
  StrikethroughIcon,
  TableIcon,
  TaskListIcon
} from '../../shell/icons';
import type { EditorCommand, EditorEditAction } from './editorCommands';
import styles from './EditorContextMenu.module.css';

interface EditorContextMenuProps {
  children: ReactElement;
  enabled: boolean;
  canEdit: boolean;
  onRunCommand(command: EditorCommand): void;
  onEditAction(action: EditorEditAction): void;
  onInsertImage(): void;
  onCreateAnnotation(): void;
}

type ContextAction = EditorCommand | Extract<EditorEditAction, 'cut' | 'copy' | 'paste'> | 'create-annotation';

const editActions = new Set<ContextAction>(['cut', 'copy', 'paste']);

export function EditorContextMenu({
  children,
  enabled,
  canEdit,
  onRunCommand,
  onEditAction,
  onInsertImage,
  onCreateAnnotation
}: EditorContextMenuProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const [anchorPoint, setAnchorPoint] = useState({ x: 0, y: 0, sequence: 0 });

  useLayoutEffect(() => {
    if (!anchorPoint.sequence) return;
    anchorRef.current?.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: anchorPoint.x,
      clientY: anchorPoint.y
    }));
  }, [anchorPoint]);

  if (!enabled) return children;

  const runAction = (key: Key) => {
    const action = String(key) as ContextAction;
    if (action === 'create-annotation') onCreateAnnotation();
    else if (editActions.has(action)) onEditAction(action as 'cut' | 'copy' | 'paste');
    else onRunCommand(action as EditorCommand);
  };

  return (
    <div
      ref={targetRef}
      className={styles.target}
      onContextMenu={(event) => {
        if (event.target === anchorRef.current) return;
        event.preventDefault();
        setAnchorPoint((current) => ({
          x: event.clientX,
          y: event.clientY,
          sequence: current.sequence + 1
        }));
      }}
    >
      {children}
      <MenuTrigger
        trigger="contextMenu"
        onOpenChange={(open) => {
          if (!open) window.requestAnimationFrame(() => {
            targetRef.current?.querySelector<HTMLElement>('.ProseMirror')?.focus();
          });
        }}
      >
        <PressableButton
          ref={anchorRef}
          className={styles.anchor}
          aria-label="编辑器右键快捷功能"
          aria-hidden="true"
          tabIndex={-1}
          style={{ left: anchorPoint.x, top: anchorPoint.y }}
        >{null}</PressableButton>
        <MenuPopover
          placement="right top"
          offset={0}
          containerPadding={12}
          className={styles.popover}
        >
          <Menu ariaLabel="编辑器右键快捷功能" className={styles.menu} onAction={runAction}>
            <MenuSection className={styles.quickSection}>
              <MenuHeader className={styles.sectionLabel}>编辑</MenuHeader>
              {quickItem('cut', '剪切', <CutIcon size={18} />, !canEdit)}
              {quickItem('copy', '复制', <CopyIcon size={18} />)}
              {quickItem('paste', '粘贴', <PasteIcon size={18} />, !canEdit)}
              {quickItem('delete-selection', '删除', <DeleteIcon size={18} />, !canEdit)}
            </MenuSection>

            <MenuSection className={styles.quickSection}>
              <MenuHeader className={styles.sectionLabel}>格式</MenuHeader>
              {quickItem('bold', '加粗', <BoldIcon size={18} />, !canEdit, 'format')}
              {quickItem('italic', '斜体', <ItalicIcon size={18} />, !canEdit, 'format')}
              {quickItem('highlight', '高亮', <HighlightIcon size={18} />, !canEdit, 'format')}
              {quickItem('inline-code', '行内代码', <CodeIcon size={18} />, !canEdit, 'format')}
              {quickItem('strikethrough', '删除线', <StrikethroughIcon size={18} />, !canEdit, 'format')}
              {quickItem('blockquote', '引用', <QuoteIcon size={18} />, !canEdit, 'format')}
            </MenuSection>

            <MenuSection className={styles.quickSection}>
              <MenuHeader className={styles.sectionLabel}>列表</MenuHeader>
              {quickItem('ordered-list', '有序', <OrderedListIcon size={18} />, !canEdit, 'list')}
              {quickItem('bullet-list', '无序', <ListIcon size={18} />, !canEdit, 'list')}
              {quickItem('task-list', '任务', <TaskListIcon size={18} />, !canEdit, 'list')}
              {quickItem('outdent', '减少缩进', <OutdentIcon size={18} />, !canEdit, 'indent')}
              {quickItem('indent', '增加缩进', <IndentIcon size={18} />, !canEdit, 'indent')}
            </MenuSection>

            <MenuSeparator className={styles.fullRow} />
            <MenuItem id="create-annotation" icon={<HighlightIcon size={15} />} isDisabled={!canEdit}>标记为重要内容</MenuItem>
            <SubmenuTrigger delay={120}>
              <MenuItem id="heading-menu" className={styles.submenuTrigger}>标题</MenuItem>
              <MenuPopover placement="end top" offset={-1} containerPadding={12} className={styles.submenuPopover}>
                <Menu ariaLabel="标题样式" className={styles.submenu} onAction={runAction}>
                  <MenuItem id="paragraph" kbd="Ctrl+0" isDisabled={!canEdit}>段落</MenuItem>
                  <MenuItem id="heading-1" kbd="Ctrl+1" isDisabled={!canEdit}>H1</MenuItem>
                  <MenuItem id="heading-2" kbd="Ctrl+2" isDisabled={!canEdit}>H2</MenuItem>
                  <MenuItem id="heading-3" kbd="Ctrl+3" isDisabled={!canEdit}>H3</MenuItem>
                  <MenuItem id="heading-4" kbd="Ctrl+4" isDisabled={!canEdit}>H4</MenuItem>
                </Menu>
              </MenuPopover>
            </SubmenuTrigger>
            <SubmenuTrigger delay={120}>
              <MenuItem id="insert-menu" className={styles.submenuTrigger}>插入</MenuItem>
              <MenuPopover placement="end top" offset={-1} containerPadding={12} className={styles.submenuPopover}>
                <Menu ariaLabel="插入内容" className={styles.submenu} onAction={runAction}>
                  <MenuItem id="table" icon={<TableIcon size={15} />} isDisabled={!canEdit}>表格</MenuItem>
                  <MenuItem id="horizontal-rule" icon={<HorizontalRuleIcon size={15} />} isDisabled={!canEdit}>水平分割线</MenuItem>
                  <MenuItem id="code-block" icon={<CodeIcon size={15} />} isDisabled={!canEdit}>代码块</MenuItem>
                  <MenuItem id="blockquote" icon={<QuoteIcon size={15} />} isDisabled={!canEdit}>引用</MenuItem>
                  <MenuItem id="image" icon={<ImageIcon size={15} />} isDisabled={!canEdit} onAction={onInsertImage}>图片</MenuItem>
                  <MenuSeparator />
                  <MenuItem id="paragraph-above" icon={<ParagraphAddIcon size={15} position="above" />} isDisabled={!canEdit}>在上方插入段落</MenuItem>
                  <MenuItem id="paragraph-below" icon={<ParagraphAddIcon size={15} />} isDisabled={!canEdit}>在下方插入段落</MenuItem>
                </Menu>
              </MenuPopover>
            </SubmenuTrigger>
          </Menu>
        </MenuPopover>
      </MenuTrigger>
    </div>
  );
}

function quickItem(
  id: ContextAction,
  label: string,
  icon: ReactElement,
  disabled = false,
  variant: 'primary' | 'format' | 'list' | 'indent' = 'primary'
) {
  return (
    <MenuItem
      id={id}
      textValue={label}
      aria-label={label}
      icon={icon}
      isDisabled={disabled}
      className={`${styles.quickItem} ${styles[`${variant}Item`]}`}
    >
      {label}
    </MenuItem>
  );
}
