import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const directory = resolve(import.meta.dirname, '../../apps/web-v4/src/components/ui');
const readCss = (file) => readFileSync(join(directory, file), 'utf8');

const css = {
  button: readCss('./button/Button.module.css'),
  ghost: readCss('./button/GhostIconButton.module.css'),
  segmented: readCss('./button/SegmentedControl.module.css'),
  input: readCss('./input/Input.module.css'),
  search: readCss('./input/SearchBox.module.css'),
  collection: readCss('./collection/Collection.module.css'),
  overlay: readCss('./overlay/Overlay.module.css'),
  navigation: readCss('./navigation/SideNavItem.module.css')
};

function declarations(source, selector) {
  return [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(',').some((value) => value.trim() === selector))
    .map(([, , body]) => body)
    .join('\n');
}

/* 只锁定 V5 共享视觉契约；点击、校验与键盘导航由各组件行为测试覆盖。 */
describe('V5 shared control styles', () => {
  it('keeps interactive controls stationary and removes the old ink borders', () => {
    for (const source of [css.button, css.ghost, css.segmented, css.collection]) {
      assert.doesNotMatch(source, /transform\s*:\s*translate/);
      assert.doesNotMatch(source, /border(?:-color)?\s*:[^;]*var\(--ink\)/);
      assert.doesNotMatch(source, /box-shadow\s*:\s*\d+px\s+\d+px\s+0\s/);
    }
  });

  it('uses semantic radii and soft elevation for controls and overlays', () => {
    assert.ok(declarations(css.button, '.btn').includes('border-radius: var(--radius-control)'));
    assert.ok(declarations(css.button, '.btn').includes('box-shadow: var(--shadow-control)'));
    for (const selector of ['.popover', '.menu']) {
      assert.ok(declarations(css.overlay, selector).includes('border-radius: var(--radius-popover)'));
      assert.ok(declarations(css.overlay, selector).includes('box-shadow: var(--shadow-popover)'));
    }
    assert.ok(declarations(css.overlay, '.dialog').includes('border-radius: var(--radius-panel)'));
    assert.doesNotMatch(declarations(css.overlay, '.menuPopover'), /(?:background|border|box-shadow)\s*:/);
  });

  it('preserves a visible keyboard outline in addition to the translucent focus ring', () => {
    for (const [source, selector] of [
      [css.button, '.btn[data-focus-visible]'],
      [css.ghost, '.ghost:focus-visible'],
      [css.segmented, '.segment[data-focus-visible]'],
      [css.input, '.selectTrigger[data-focus-visible]'],
      [css.input, '.checkbox[data-focus-visible] .box'],
      [css.overlay, '.item[data-focus-visible]'],
      [css.navigation, '.item[data-focus-visible]']
    ]) {
      const rule = declarations(source, selector);
      assert.ok(rule.includes('outline: 2px solid var(--accent-text)'));
      assert.ok(rule.includes('box-shadow: var(--focus-ring)'));
    }
  });

  it('keeps native input shadows off and gives invalid shells their own focus treatment', () => {
    for (const source of [css.input, css.search]) {
      const nativeInput = declarations(source, '.input');
      assert.ok(nativeInput.includes('background: transparent'));
      assert.ok(nativeInput.includes('box-shadow: none'));
      assert.ok(source.includes('var(--focus-ring-danger'));
      assert.ok(source.includes('outline-color: var(--ink-danger)'));
    }
  });

  it('styles React Aria select options through their accessible role', () => {
    assert.ok(declarations(css.collection, ".listbox [role='option']").includes('border-radius: var(--radius-control)'));
    assert.ok(declarations(css.collection, ".listbox [role='option'][data-selected]").includes('var(--accent-text)'));
    assert.ok(declarations(css.collection, ".listbox [role='option'][data-disabled]").includes('cursor: not-allowed'));
  });

  it('keeps sidebar navigation neutral until selected and preserves touch targets', () => {
    assert.ok(declarations(css.navigation, '.icon').includes('--knowra-icon-accent: currentColor'));
    assert.ok(declarations(css.navigation, ".item[aria-current='page']").includes('color: var(--text-primary)'));
    assert.ok(declarations(css.navigation, ".item[aria-current='page'] .icon").includes('color: var(--accent)'));
    assert.ok(declarations(css.navigation, '.compact').includes('min-height: 30px'));
    assert.ok(css.ghost.includes('(any-pointer: coarse)'));
    assert.ok(css.ghost.includes('min-width: 44px; min-height: 44px'));
  });
});
