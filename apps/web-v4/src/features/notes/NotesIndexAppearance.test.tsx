import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesIndexAppearanceControls, notesIndexAppearanceProps } from './NotesIndexAppearance';
import { DEFAULT_NOTES_INDEX_APPEARANCE, NOTES_INDEX_APPEARANCE_KEY, parseNotesIndexAppearance, setNotesIndexAppearance, useNotesIndexAppearance } from './notesIndexAppearance';

function Surface() { const appearance = useNotesIndexAppearance(); return <div data-testid="surface" {...notesIndexAppearanceProps(appearance)} />; }
beforeEach(() => { localStorage.clear(); act(() => setNotesIndexAppearance(DEFAULT_NOTES_INDEX_APPEARANCE)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('索引局部外观', () => {
  it('校验持久化数据，不接纳未知值', () => {
    expect(parseNotesIndexAppearance({ mode: 'dark', theme: 'invalid', shape: 1, deco: null })).toEqual({ mode: 'dark', theme: 'orange', shape: 'pill', deco: 'full' });
  });
  it('独立切换四组设置并同步局部容器，不修改全局document主题', async () => {
    const initialRoot = document.documentElement.outerHTML.split('>')[0];
    render(<><NotesIndexAppearanceControls /><Surface /></>);
    await userEvent.click(screen.getByRole('button', { name: '切换深色模式' }));
    await userEvent.click(screen.getByRole('button', { name: '黑白配色' }));
    await userEvent.click(screen.getByRole('button', { name: '圆角' }));
    await userEvent.click(screen.getByRole('button', { name: /^素$/ }));
    const surface = screen.getByTestId('surface');
    expect(surface).toHaveAttribute('data-ni-mode', 'dark');
    expect(surface).toHaveAttribute('data-ni-theme', 'mono');
    expect(surface).toHaveAttribute('data-ni-shape', 'rounded');
    expect(surface).toHaveAttribute('data-ni-deco', 'off');
    expect(JSON.parse(localStorage.getItem(NOTES_INDEX_APPEARANCE_KEY)!)).toEqual({ mode: 'dark', theme: 'mono', shape: 'rounded', deco: 'off' });
    expect(document.documentElement.outerHTML.split('>')[0]).toBe(initialRoot);
  });
  it('存储不可用时依然允许切换并在重新挂载后保留会话设置', async () => {
    render(<><NotesIndexAppearanceControls /><Surface /></>);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage denied'); });
    await userEvent.click(screen.getByRole('button', { name: '切换深色模式' }));
    expect(screen.getByTestId('surface')).toHaveAttribute('data-ni-mode', 'dark');
    cleanup();
    render(<Surface />);
    expect(screen.getByTestId('surface')).toHaveAttribute('data-ni-mode', 'dark');
  });
  it('接收其它标签页的持久化外观更新', () => {
    render(<Surface />);
    localStorage.setItem(NOTES_INDEX_APPEARANCE_KEY, JSON.stringify({ mode: 'dark', deco: 'off' }));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: NOTES_INDEX_APPEARANCE_KEY })));
    expect(screen.getByTestId('surface')).toHaveAttribute('data-ni-mode', 'dark');
    expect(screen.getByTestId('surface')).toHaveAttribute('data-ni-deco', 'off');
  });
});
