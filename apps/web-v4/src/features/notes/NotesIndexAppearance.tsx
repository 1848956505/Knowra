import { GhostIconButton, SegmentedButton, SegmentedControl } from '../../components/ui';
import { useNotesIndexAppearance, setNotesIndexAppearance, type NotesIndexAppearance } from './notesIndexAppearanceModel';
import styles from './NotesIndexTheme.module.css';

/** Apply only to the index shell, index content, or the notes context sidebar. */
export function notesIndexAppearanceProps(appearance: NotesIndexAppearance) {
  return {
    className: styles.theme,
    'data-ni-mode': appearance.mode,
    'data-ni-theme': appearance.theme,
    'data-ni-shape': appearance.shape,
    'data-ni-deco': appearance.deco
  };
}

export function NotesIndexAppearanceControls() {
  const appearance = useNotesIndexAppearance();
  return <div {...notesIndexAppearanceProps(appearance)} className={`${styles.theme} ${styles.controls}`} aria-label="笔记索引外观">
    <SegmentedControl aria-label="装饰" className={styles.decorations}>
      <span className={styles.controlLabel}>装饰</span>
      <SegmentedButton aria-pressed={appearance.deco === 'off'} onPress={() => setNotesIndexAppearance({ deco: 'off' })}>素</SegmentedButton>
      <SegmentedButton aria-pressed={appearance.deco === 'full'} onPress={() => setNotesIndexAppearance({ deco: 'full' })}>完整</SegmentedButton>
    </SegmentedControl>
    <SegmentedControl aria-label="控件形状">
      <SegmentedButton aria-pressed={appearance.shape === 'rounded'} onPress={() => setNotesIndexAppearance({ shape: 'rounded' })}>圆角</SegmentedButton>
      <SegmentedButton aria-pressed={appearance.shape === 'pill'} onPress={() => setNotesIndexAppearance({ shape: 'pill' })}>胶囊</SegmentedButton>
    </SegmentedControl>
    <GhostIconButton size={24} aria-label={appearance.mode === 'light' ? '切换深色模式' : '切换浅色模式'} title={appearance.mode === 'light' ? '深色模式' : '浅色模式'} aria-pressed={appearance.mode === 'dark'} onPress={() => setNotesIndexAppearance({ mode: appearance.mode === 'light' ? 'dark' : 'light' })}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {appearance.mode === 'light' ? <path d="M20 14a8.5 8.5 0 0 1-10-10A8.5 8.5 0 1 0 20 14Z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></>}
      </svg>
    </GhostIconButton>
    <div className={styles.swatches} role="group" aria-label="索引配色">
      {(['mono', 'orange'] as const).map(theme => <GhostIconButton key={theme} size={24} aria-label={theme === 'mono' ? '黑白配色' : '橙色配色'} aria-pressed={appearance.theme === theme} onPress={() => setNotesIndexAppearance({ theme })}>
        <span className={styles.swatch} data-color={theme} data-selected={appearance.theme === theme || undefined} aria-hidden="true" />
      </GhostIconButton>)}
    </div>
  </div>;
}

export function NotesIndexTitleTab() {
  return <span className={styles.indexTab}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M5 4h8M5 8h8M5 12h8M2 4h1M2 8h1M2 12h1" /></svg>笔记索引</span>;
}
