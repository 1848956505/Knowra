import { describe, expect, it, vi } from 'vitest';
import { deriveStatusPath } from './statusPath';

describe('deriveStatusPath', () => {
  it('keeps the notes index surface stable despite latent store selections', () => {
    const path = deriveStatusPath({
      pathname: '/materials',
      routeDomain: 'materials',
      onNavigateHome: vi.fn(),
      onNavigateMaterials: vi.fn()
    });

    expect(path.map((segment) => segment.label)).toEqual(['主页', '笔记库']);
    expect(path.at(-1)?.current).toBe(true);
    expect(path.some((segment) => segment.label.includes('M4-02'))).toBe(false);
  });

  it('keeps the home surface as a single current segment', () => {
    const path = deriveStatusPath({
      pathname: '/',
      routeDomain: 'materials',
      onNavigateHome: vi.fn(),
      onNavigateMaterials: vi.fn()
    });

    expect(path).toEqual([{ id: 'home', label: '主页', current: true, onNavigate: expect.any(Function) }]);
  });
});
