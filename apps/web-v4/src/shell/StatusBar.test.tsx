import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StatusBar } from './StatusBar';

const here = dirname(fileURLToPath(import.meta.url));
const cssText = readFileSync(resolve(here, './StatusBar.module.css'), 'utf8');

describe('StatusBar breadcrumb path', () => {
  it('renders a single segment as the current location with no separator', () => {
    render(
      <StatusBar
        path={[{ id: 'home', label: '主页', current: true }]}
        dataMode="api"
      />
    );

    const breadcrumb = screen.getByLabelText('工作区位置');
    // 没有分隔符
    expect(within(breadcrumb).queryByText('/')).not.toBeInTheDocument();
    // 末段用 span 渲染，无视觉强调
    const current = within(breadcrumb).getByText('主页');
    expect(current.tagName).toBe('SPAN');
    expect(current).toHaveAttribute('aria-current', 'location');
  });

  it('renders multi-segment path with separators and clickable non-current segments', async () => {
    const onJump = vi.fn();
    render(
      <StatusBar
        path={[
          { id: 'home', label: '主页', onNavigate: () => onJump('home') },
          { id: 'materials', label: '笔记库', onNavigate: () => onJump('materials') },
          { id: 'note:1', label: 'Q3 产品规划草案', current: true }
        ]}
        dataMode="api"
      />
    );

    const breadcrumb = screen.getByLabelText('工作区位置');
    // 段间分隔符两次
    const separators = within(breadcrumb).getAllByText('/', { exact: true });
    expect(separators.length).toBe(2);
    // 前两段渲染为 button
    const buttons = within(breadcrumb).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['主页', '笔记库']);
    // 末段渲染为 span + aria-current
    const noteLabel = within(breadcrumb).getByText('Q3 产品规划草案');
    expect(noteLabel.tagName).toBe('SPAN');
    expect(noteLabel).toHaveAttribute('aria-current', 'location');
    // 点击前段触发 onNavigate
    await userEvent.click(within(breadcrumb).getByRole('button', { name: '跳转到「主页」' }));
    expect(onJump).toHaveBeenCalledWith('home');
  });

  it('treats the last segment as current when current flag is omitted and no onNavigate', () => {
    render(
      <StatusBar
        path={[
          { id: 'home', label: '主页', onNavigate: () => undefined },
          { id: 'materials', label: '笔记库' }
        ]}
        dataMode="api"
      />
    );

    const breadcrumb = screen.getByLabelText('工作区位置');
    // 末段没传 current，但 StatusBar 推断为 current → span + aria-current
    const current = within(breadcrumb).getByText('笔记库');
    expect(current.tagName).toBe('SPAN');
    expect(current).toHaveAttribute('aria-current', 'location');
    // 前段是 button
    const buttons = within(breadcrumb).getAllByRole('button');
    expect(buttons).toHaveLength(1);
  });

  it('falls back to static text when the last segment has no onNavigate', () => {
    render(
      <StatusBar
        path={[
          { id: 'home', label: '主页' },
          { id: 'domain:knowledge', label: '知识库', current: true }
        ]}
        dataMode="api"
      />
    );

    const breadcrumb = screen.getByLabelText('工作区位置');
    // 当前段不可点
    expect(within(breadcrumb).queryByRole('button', { name: '跳转到「知识库」' })).not.toBeInTheDocument();
  });

  it('returns null content for an empty path', () => {
    render(<StatusBar path={[]} dataMode="api" />);
    expect(screen.queryByLabelText('工作区位置')).not.toBeInTheDocument();
  });

  it('still renders a long current title without dropping content (visual ellipsis is CSS-only)', () => {
    const longTitle = 'M4-02 文档 Tab 长标题回归验证：保留拖拽、右键菜单、关闭、未保存标记与溢出菜单';
    render(
      <StatusBar
        path={[
          { id: 'home', label: '主页', onNavigate: () => undefined },
          { id: 'materials', label: '笔记库', onNavigate: () => undefined },
          { id: 'note:1', label: longTitle, current: true }
        ]}
        dataMode="api"
      />
    );

    const breadcrumb = screen.getByLabelText('工作区位置');
    // 文本完整保留（视觉省略由 CSS text-overflow:ellipsis 兜底，jsdom 不渲染样式）
    expect(within(breadcrumb).getByText(longTitle)).toBeInTheDocument();
  });

  it('declares text-overflow:ellipsis on segments so long titles do not break the 32px statusbar', () => {
    // jsdom 不渲染真实 CSS，但 .pathCurrent / .pathLink 必须保留 ellipsis 兜底，
    // 否则长 title 会撑爆 StatusBar 高度。源码层断言防止有人误删。
    expect(cssText).toMatch(/\.pathCurrent\b[\s\S]*?text-overflow:\s*ellipsis/);
    expect(cssText).toMatch(/\.pathLink\b[\s\S]*?text-overflow:\s*ellipsis/);
    // 同时 .context 必须是 flex + min-width:0 + flex:1 1 auto，否则 inline-flex 不收缩。
    expect(cssText).toMatch(/\.context\b[\s\S]*?display:\s*flex/);
    expect(cssText).toMatch(/\.context\b[\s\S]*?flex:\s*1 1 auto/);
    expect(cssText).toMatch(/\.context\b[\s\S]*?min-width:\s*0/);
  });
});
