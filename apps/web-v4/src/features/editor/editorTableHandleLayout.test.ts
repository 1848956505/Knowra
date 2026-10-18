import { afterEach, describe, expect, it, vi } from 'vitest';
import { placeTableHandle, tableHandleSize } from './editorTableHandleLayout';

afterEach(() => vi.unstubAllGlobals());

describe('表格手柄实际尺寸与视口边界', () => {
  it('手机或粗指针使用44px，桌面使用24px', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', matchMedia);
    expect(tableHandleSize()).toBe(44);
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 767px), (any-pointer: coarse)');
    matchMedia.mockReturnValue({ matches: false });
    expect(tableHandleSize()).toBe(24);
  });
  it.each([24, 44])('以实际%dpx宽度约束右边界和左边界', size => {
    expect(placeTableHandle(500, 50, size, 390).left + size).toBe(386);
    expect(placeTableHandle(-20, -20, size, 390)).toEqual({ left: 4, top: 4 });
  });
});
