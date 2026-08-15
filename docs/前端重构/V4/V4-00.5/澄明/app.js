/* 澄明 · 原型演示交互
   只负责：⌘K 命令面板开合、Escape/遮罩关闭、菜单开合、焦点回触发器。
   无真实数据逻辑。 */
(function () {
  'use strict';

  var paletteOverlay = document.getElementById('palette-overlay');
  var lastTrigger = null;

  function openPalette(trigger) {
    if (!paletteOverlay) return;
    lastTrigger = trigger || document.activeElement;
    paletteOverlay.hidden = false;
    var input = paletteOverlay.querySelector('[data-palette-input]');
    if (input) input.focus();
  }

  function closePalette() {
    if (!paletteOverlay || paletteOverlay.hidden) return;
    paletteOverlay.hidden = true;
    if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
    lastTrigger = null;
  }

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (paletteOverlay && paletteOverlay.hidden) openPalette(null);
      else closePalette();
      return;
    }
    if (e.key === 'Escape') {
      closePalette();
      closeMenu();
    }
  });

  document.querySelectorAll('[data-open-palette]').forEach(function (btn) {
    btn.addEventListener('click', function () { openPalette(btn); });
  });

  if (paletteOverlay) {
    paletteOverlay.addEventListener('mousedown', function (e) {
      if (e.target === paletteOverlay) closePalette();
    });
  }

  /* ---------- 菜单开合（如 editor.html 的「文件」菜单） ---------- */

  var openMenuEl = null;
  var menuTrigger = null;

  function closeMenu() {
    if (!openMenuEl) return;
    openMenuEl.hidden = true;
    var trigger = menuTrigger;
    openMenuEl = null;
    menuTrigger = null;
    if (trigger && trigger.focus) trigger.focus();
  }

  document.querySelectorAll('[data-menu-trigger]').forEach(function (btn) {
    var menu = document.getElementById(btn.getAttribute('data-menu-trigger'));
    if (!menu) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openMenuEl === menu) { closeMenu(); return; }
      closeMenu();
      var rect = btn.getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.top = (rect.bottom + 4) + 'px';
      menu.hidden = false;
      openMenuEl = menu;
      menuTrigger = btn;
      var first = menu.querySelector('.menu-item');
      if (first) first.focus();
    });
  });

  document.addEventListener('mousedown', function (e) {
    if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu();
  });
})();
