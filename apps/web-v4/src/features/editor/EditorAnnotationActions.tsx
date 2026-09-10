import { useEffect, useState, type RefObject } from 'react';
import type { EditorView } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import { BoldIcon, ItalicIcon, CodeIcon, StarIcon } from '../../shell/icons';
import { GhostIconButton } from '../../components/ui/button';
import { Menu, MenuItem, MenuPopover, MenuTrigger } from '../../components/ui/overlay';
import type { EditorCommand } from './editorCommands';
import styles from './EditorAnnotationActions.module.css';

type Scope = 'selection' | 'blocks' | 'section';
interface Props {
  hostRef: RefObject<HTMLDivElement | null>;
  getView(): EditorView | null;
  onCreate(scope: Scope): Promise<void>;
  onCommand(command: EditorCommand): void;
  onStatus?(message: string): void;
}

export function EditorAnnotationActions({ hostRef, getView, onCreate, onCommand, onStatus }: Props) {
  const [selection, setSelection] = useState<{ x: number; y: number } | null>(null);
  const [block, setBlock] = useState<{ x: number; y: number; pos: number; heading: boolean } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const updateSelection = () => {
      const native = window.getSelection();
      if (!native || native.isCollapsed || !native.anchorNode || !native.focusNode || !host.contains(native.anchorNode) || !host.contains(native.focusNode)) { setSelection(null); return; }
      const rect = native.getRangeAt(0).getBoundingClientRect();
      setSelection({ x: Math.max(8, Math.min(rect.left, window.innerWidth - 128)), y: Math.max(8, rect.top - 36) });
      setBlock(null);
    };
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const hover = (event: PointerEvent) => {
      clearTimeout(hideTimer);
      if (menuOpen || !window.getSelection()?.isCollapsed) return;
      if (event.target instanceof Element && event.target.closest('[data-annotation-actions]')) return;
      const view = getView();
      const target = event.target instanceof Element ? event.target.closest('p,h1,h2,h3,h4,h5,h6,pre,li,blockquote,table,hr') : null;
      if (!view || !target || !view.dom.contains(target)) { hideTimer = setTimeout(() => setBlock(null), 150); return; }
      const rect = target.getBoundingClientRect();
      setBlock({ x: Math.max(4, rect.left - 32), y: rect.top, pos: view.posAtDOM(target, 0), heading: /^H[1-6]$/.test(target.tagName) });
    };
    const hide = () => { setSelection(null); if (!menuOpen) setBlock(null); };
    document.addEventListener('selectionchange', updateSelection);
    document.addEventListener('pointermove', hover);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      clearTimeout(hideTimer);
      document.removeEventListener('selectionchange', updateSelection);
      document.removeEventListener('pointermove', hover);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [hostRef, getView, menuOpen]);

  async function create(scope: Scope) {
    if (pending) return;
    setPending(true);
    try {
      if (scope !== 'selection' && block) {
        const view = getView();
        if (!view) return;
        view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(Math.min(block.pos, view.state.doc.content.size)))));
      }
      await onCreate(scope);
      setSelection(null);
      setBlock(null);
    } catch (error) { onStatus?.(error instanceof Error ? error.message : '创建重点失败'); }
    finally { setPending(false); }
  }

  return <>
    {selection ? <div className={styles.toolbar} style={{ left: selection.x, top: selection.y }} role="toolbar" aria-label="选区工具" onMouseDown={(event) => event.preventDefault()}>
      <GhostIconButton size={24} aria-label="加粗" title="加粗" onPress={() => onCommand('bold')}><BoldIcon size={15} /></GhostIconButton>
      <GhostIconButton size={24} aria-label="斜体" title="斜体" onPress={() => onCommand('italic')}><ItalicIcon size={15} /></GhostIconButton>
      <GhostIconButton size={24} aria-label="行内代码" title="行内代码" onPress={() => onCommand('inline-code')}><CodeIcon size={15} /></GhostIconButton>
      <span className={styles.divider} aria-hidden="true" />
      <GhostIconButton size={24} aria-label="标记重点" title="标记重点" disabled={pending} onPress={() => void create('selection')}><StarIcon size={15} fill="currentColor" /></GhostIconButton>
    </div> : null}
    {block && !selection ? <div data-annotation-actions className={styles.blockAction} style={{ left: block.x, top: block.y }}>
      <MenuTrigger isOpen={menuOpen} onOpenChange={setMenuOpen}>
        <GhostIconButton aria-label={block.heading ? '标题重点菜单' : '内容块重点菜单'}>⋮</GhostIconButton>
        <MenuPopover placement="bottom start"><Menu ariaLabel="标记重点">
          <MenuItem id="blocks" isDisabled={pending} onAction={() => void create('blocks')}>标记此块为重点</MenuItem>
          {block.heading ? <MenuItem id="section" isDisabled={pending} onAction={() => void create('section')}>标记本节为重点</MenuItem> : null}
        </Menu></MenuPopover>
      </MenuTrigger>
    </div> : null}
  </>;
}
