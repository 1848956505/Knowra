/* 知境 · 柔光（五库统一版）—— app.js */
(() => {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const root = document.documentElement;
  const body = document.body;
  const editorView = $("#editor-view");
  const homeView = $("#home-view");
  const noteTitle = $("#note-title");
  const saveLabel = $("#save-label");
  const slashInput = $("#slash-input");
  const slashMenu = $("#slash-menu");
  const bubbleMenu = $("#bubble-menu");
  const cmdDialog = $("#cmd-dialog");
  const cmdInput = $("#cmd-input");
  const cmdRows = $$(".cmd-row");
  const docBody = $(".doc-body");

  let saveTimer = null;
  let toastTimer = null;
  let slashTarget = null;
  let slashIndex = 0;
  let cmdIndex = 0;

  /* ---------- Toast ---------- */
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-show"), 1800);
  }

  /* ---------- 视图路由 ---------- */
  function setRoute(route, title) {
    const isEditor = route === "editor";
    homeView.classList.toggle("view-hidden", isEditor);
    editorView.classList.toggle("view-hidden", !isEditor);
    body.dataset.view = route;
    $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.route === route));
    closeSlash();
    history.replaceState(null, "", isEditor ? "#editor" : "#home");
    document.title = isEditor ? (title || "未命名") + " · 知境" : "知境 · 柔光";
  }

  /* ---------- 打开文档 ---------- */
  function openDoc(title) {
    if (!title || title === "home") { setRoute("home"); return; }
    setRoute("editor", title);
    noteTitle.textContent = title;
    $(".breadcrumb .is-current").textContent = title;
    // 目录树当前态
    $$(".tree-leaf").forEach((el) => el.classList.remove("is-current"));
    const match = $$(".tree-leaf").find((el) => el.textContent.trim() === title);
    if (match) match.classList.add("is-current");
    // 同步激活 Tab（tabs 带 data-title）
    const tab = $$(".doc-tab").find((t) => t.dataset.title === title);
    if (tab) activateTab(tab);
    else {
      const activeTab = $(".doc-tab.is-active") || $(".doc-tab");
      if (activeTab) { $(".tab-name", activeTab).textContent = title; activeTab.dataset.title = title; }
    }
    toast(`已打开「${title}」`);
  }

  /* ---------- 新建文档 ---------- */
  function createNewDoc() {
    setRoute("editor", "未命名");
    noteTitle.textContent = "";
    const activeTab = $(".doc-tab.is-active") || $(".doc-tab");
    if (activeTab) { $(".tab-name", activeTab).textContent = "未命名"; activeTab.dataset.title = "未命名"; }
    noteTitle.focus();
    toast("已创建一个空白笔记");
  }

  /* ---------- 文档 Tab ---------- */
  function activateTab(tab) {
    $$(".doc-tab").forEach((t) => {
      t.classList.toggle("is-active", t === tab);
      t.setAttribute("aria-selected", String(t === tab));
    });
    const name = $(".tab-name", tab)?.textContent || "";
    if (name) { noteTitle.textContent = name; $(".breadcrumb .is-current").textContent = name; }
  }

  function closeTab(btn) {
    const tab = btn.closest(".doc-tab");
    const wasActive = tab.classList.contains("is-active");
    if ($$(".doc-tab").length <= 1) { toast("至少保留一个打开的文档"); return; }
    tab.remove();
    if (wasActive) {
      const next = $(".doc-tab");
      if (next) activateTab(next);
    }
  }

  /* ---------- 命令面板（⌘K） ---------- */
  function openCommand() {
    cmdDialog.hidden = false;
    cmdInput.value = "";
    cmdRows.forEach((r) => (r.hidden = false));
    $("#cmd-empty").hidden = true;
    cmdIndex = 0;
    markCmd();
    requestAnimationFrame(() => cmdInput.focus());
  }
  function closeCommand() { cmdDialog.hidden = true; }

  function visibleCmdRows() { return cmdRows.filter((r) => !r.hidden); }
  function markCmd() {
    const list = visibleCmdRows();
    list.forEach((r, i) => r.classList.toggle("is-active", i === cmdIndex));
    if (list[cmdIndex]) list[cmdIndex].scrollIntoView({ block: "nearest" });
  }

  cmdInput.addEventListener("input", () => {
    const q = cmdInput.value.trim().toLowerCase();
    let visible = 0;
    cmdRows.forEach((r) => {
      const hit = r.textContent.toLowerCase().includes(q);
      r.hidden = !hit;
      if (hit) visible += 1;
    });
    $("#cmd-empty").hidden = visible !== 0;
    cmdIndex = 0;
    markCmd();
  });

  cmdDialog.addEventListener("mousedown", (e) => { if (e.target === cmdDialog) closeCommand(); });

  /* ---------- Slash 命令 ---------- */
  const BLOCK_TEMPLATES = {
    text: (t) => `<p class="blk-p" contenteditable="true" spellcheck="false">${t || ""}</p>`,
    h2: (t) => `<h2 class="blk-h2" contenteditable="true" spellcheck="false">${t || "章节标题"}</h2>`,
    h3: (t) => `<h3 class="blk-h3" contenteditable="true" spellcheck="false">${t || "子标题"}</h3>`,
    todo: (t) => `<ul class="blk-todo"><li><button class="todo-check" data-action="todo-toggle" aria-label="标记完成"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg></button><span contenteditable="true" spellcheck="false">${t || "待办事项"}</span></li></ul>`,
    quote: (t) => `<blockquote class="blk-quote" contenteditable="true" spellcheck="false">${t || "输入引用文字…"}</blockquote>`,
    image: () => `<div class="blk-image" contenteditable="false"><svg class="ic" aria-hidden="true"><use href="#i-image"/></svg> 图片占位 —— 正式接入时替换为 Milkdown 图片块</div>`,
    code: (t) => `<pre class="blk-code" contenteditable="true" spellcheck="false">${t || "const 想法 = 值得记录;"}</pre>`,
    ai: () => `<aside class="blk-callout"><span class="callout-icon" aria-hidden="true">✦</span><p contenteditable="true" spellcheck="false"><strong>AI 续写：</strong>真正值得保存的，不只是答案，还有抵达答案时经过的路径。</p></aside>`,
  };
  const HANDLE = `<span class="block-handle"><button class="block-plus" data-action="slash" aria-label="在下方插入块"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg></button><span class="block-grip" draggable="true"><svg class="ic" aria-hidden="true"><use href="#i-grip"/></svg></span></span>`;

  function openSlash(anchor, target) {
    slashTarget = target || null;
    const rect = anchor.getBoundingClientRect();
    const h = 430;
    const top = Math.min(rect.bottom + 6, window.innerHeight - h - 12);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - 300);
    slashMenu.style.top = `${Math.max(12, top)}px`;
    slashMenu.style.left = `${left}px`;
    slashMenu.hidden = false;
    const rows = $$(".pop-row", slashMenu);
    rows.forEach((r, i) => r.classList.toggle("is-active", i === 0));
    slashIndex = 0;
  }
  function closeSlash() { slashMenu.hidden = true; slashTarget = null; }

  function newBlockWrap(html) {
    const wrap = document.createElement("div");
    wrap.className = "block-wrap";
    wrap.draggable = true;
    wrap.innerHTML = HANDLE + html;
    return wrap;
  }

  function insertBlock(type) {
    const tpl = BLOCK_TEMPLATES[type];
    if (!tpl) return;
    const html = tpl();
    if (slashTarget) {
      const wrap = newBlockWrap(html);
      slashTarget.after(wrap);
      slashTarget = null;
      focusEditable(wrap.querySelector("[contenteditable='true']"));
    } else {
      const oldWrap = slashInput.closest(".block-wrap");
      const wrap = newBlockWrap(html);
      oldWrap.replaceWith(wrap);
      focusEditable(wrap.querySelector("[contenteditable='true']"));
    }
    closeSlash();
    if (type === "ai") toast("AI 已生成一条续写建议");
    markDirty();
  }

  function focusEditable(el) {
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* ---------- 块拖拽 ---------- */
  let dragEl = null;
  docBody.addEventListener("dragstart", (e) => {
    const wrap = e.target.closest(".block-wrap");
    if (!wrap) return;
    dragEl = wrap;
    wrap.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  docBody.addEventListener("dragover", (e) => {
    const wrap = e.target.closest(".block-wrap");
    if (wrap && wrap !== dragEl) { e.preventDefault(); wrap.classList.add("drag-over"); }
  });
  docBody.addEventListener("dragleave", (e) => {
    const wrap = e.target.closest(".block-wrap");
    if (wrap) wrap.classList.remove("drag-over");
  });
  docBody.addEventListener("drop", (e) => {
    e.preventDefault();
    const target = e.target.closest(".block-wrap");
    $$(".block-wrap", docBody).forEach((w) => w.classList.remove("drag-over", "dragging"));
    if (target && dragEl && target !== dragEl) {
      const rect = target.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) target.before(dragEl); else target.after(dragEl);
      toast("已移动内容块");
    }
    dragEl = null;
  });
  docBody.addEventListener("dragend", () => {
    $$(".block-wrap", docBody).forEach((w) => w.classList.remove("drag-over", "dragging"));
    dragEl = null;
  });

  /* ---------- 待办 ---------- */
  function toggleTodo(btn) {
    const li = btn.closest("li");
    if (li) {
      li.classList.toggle("is-done");
      btn.classList.toggle("is-done");
      const done = btn.classList.contains("is-done");
      btn.setAttribute("aria-label", done ? "取消完成" : "标记完成");
      toast(done ? "任务已完成" : "任务已恢复");
    }
  }

  /* ---------- 目录树 ---------- */
  function toggleTree(btn) {
    const targetId = btn.dataset.target;
    const children = document.getElementById(targetId);
    const expanded = btn.getAttribute("aria-expanded") !== "false";
    btn.setAttribute("aria-expanded", String(!expanded));
    if (children) children.classList.toggle("is-hidden", expanded);
  }

  /* ---------- 侧栏 / 检查器折叠 ---------- */
  function collapseSidebar(which) {
    const el = which === "catalog" ? $(".sidebar") : $(".inspector");
    if (!el) return;
    el.style.display = el.style.display === "none" ? "" : "none";
    toast(which === "catalog" ? (el.style.display === "none" ? "已收起目录" : "已展开目录") : (el.style.display === "none" ? "已收起边注" : "已展开边注"));
  }

  /* ---------- 专注模式 ---------- */
  function toggleFocus() {
    const on = body.dataset.focus !== "on";
    body.dataset.focus = on ? "on" : "";
    $$("[data-action='focus']").forEach((b) => b.classList.toggle("is-active", on));
    toast(on ? "已进入专注模式" : "已退出专注模式");
  }

  /* ---------- 主题 ---------- */
  function toggleTheme() {
    const dark = root.dataset.theme !== "dark";
    root.dataset.theme = dark ? "dark" : "";
    try { localStorage.setItem("knowra-softlight-theme", dark ? "dark" : "light"); } catch (_) {}
  }

  /* ---------- 编辑保存状态 ---------- */
  function markDirty() {
    saveLabel.dataset.state = "saving";
    $(".save-text", saveLabel).textContent = "保存中…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveLabel.dataset.state = "saved";
      $(".save-text", saveLabel).textContent = "已保存";
    }, 650);
  }

  /* ---------- 气泡菜单 ---------- */
  function positionBubble() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !docBody.contains(sel.anchorNode)) { bubbleMenu.hidden = true; return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width) return;
    bubbleMenu.style.top = `${Math.max(8, rect.top - 48)}px`;
    bubbleMenu.style.left = `${Math.min(window.innerWidth - 250, Math.max(8, rect.left + rect.width / 2 - 125))}px`;
    bubbleMenu.hidden = false;
  }

  function applyFormat(cmd, value) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { bubbleMenu.hidden = true; return; }
    const range = sel.getRangeAt(0);
    if (cmd === "hilite") {
      const frag = range.extractContents();
      const mark = document.createElement("mark");
      mark.style.background = "var(--amber-soft)";
      mark.style.color = "inherit";
      mark.style.padding = "0 3px";
      mark.style.borderRadius = "4px";
      mark.appendChild(frag);
      range.insertNode(mark);
      sel.removeAllRanges();
    } else if (cmd === "createLink") {
      const frag = range.extractContents();
      const a = document.createElement("a");
      a.href = "#";
      a.className = "blk-link";
      a.textContent = frag.textContent;
      range.insertNode(a);
      sel.removeAllRanges();
      toast("已插入双向链接（演示）");
    } else {
      document.execCommand(cmd, false, value);
    }
    markDirty();
    bubbleMenu.hidden = true;
  }

  /* ---------- 大纲跳转 ---------- */
  function scrollToHeading(text) {
    const target = $$(".doc-body [contenteditable='true']").find((el) => el.textContent.trim() === text);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------- 动作分发 ---------- */
  function runAction(el) {
    const action = el.dataset.action;
    switch (action) {
      case "home": setRoute("home"); break;
      case "search": openCommand(); break;
      case "theme": toggleTheme(); break;
      case "new-doc": createNewDoc(); break;
      case "open-doc": openDoc(el.dataset.title); break;
      case "todo-toggle": toggleTodo(el); break;
      case "slash": openSlash(el.closest(".block-wrap"), el.closest(".block-wrap")); break;
      case "tab-close": closeTab(el); break;
      case "tree-toggle": toggleTree(el); break;
      case "collapse-inspector": collapseSidebar("inspector"); break;
      case "collapse-catalog": collapseSidebar("catalog"); break;
      case "focus": toggleFocus(); break;
      case "add-tag": toast("正式接入时打开标签选择器"); break;
      case "inbox": toast("收集箱中有 3 条待整理内容"); break;
      case "favorite": {
        const pressed = el.getAttribute("aria-pressed") !== "true";
        el.setAttribute("aria-pressed", String(pressed));
        toast(pressed ? "已添加到收藏" : "已取消收藏");
        break;
      }
      case "share": toast("正式接入时生成分享链接"); break;
      case "more": toast("更多操作（演示）"); break;
      default: break;
    }
  }

  document.addEventListener("click", (e) => {
    const actionEl = e.target.closest("[data-action]");
    if (actionEl) { runAction(actionEl); return; }
    const cmdEl = e.target.closest("[data-command]");
    if (cmdEl) { insertBlock(cmdEl.dataset.command); return; }
    const moreEl = e.target.closest(".doc-more");
    if (moreEl) { toast("更多操作（演示）"); return; }
    const tab = e.target.closest(".doc-tab");
    if (tab && !e.target.closest("[data-action='tab-close']")) activateTab(tab);
  });

  /* 键盘 */
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); cmdDialog.hidden ? openCommand() : closeCommand(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); insertBlock("ai"); return; }
    if (e.key === "Escape") { closeCommand(); closeSlash(); bubbleMenu.hidden = true; return; }
    if (!cmdDialog.hidden) { cmdKeyNav(e); return; }
    if (!slashMenu.hidden) { slashKeyNav(e); return; }
  });

  function cmdKeyNav(e) {
    const list = visibleCmdRows();
    if (!list.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); cmdIndex = (cmdIndex + 1) % list.length; markCmd(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); cmdIndex = (cmdIndex - 1 + list.length) % list.length; markCmd(); }
    else if (e.key === "Enter") { e.preventDefault(); const row = list[cmdIndex]; if (row) { runAction(row); closeCommand(); } }
    else if (e.key === "Tab") { e.preventDefault(); cmdIndex = (cmdIndex + 1) % list.length; markCmd(); }
  }

  function slashKeyNav(e) {
    const rows = $$(".pop-row", slashMenu).filter((r) => !r.hidden);
    if (!rows.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); slashIndex = (slashIndex + 1) % rows.length; rows.forEach((r, i) => r.classList.toggle("is-active", i === slashIndex)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); slashIndex = (slashIndex - 1 + rows.length) % rows.length; rows.forEach((r, i) => r.classList.toggle("is-active", i === slashIndex)); }
    else if (e.key === "Enter") { e.preventDefault(); insertBlock(rows[slashIndex].dataset.command); }
  }

  /* Slash 输入触发 */
  slashInput.addEventListener("input", () => {
    markDirty();
    if (slashInput.textContent.startsWith("/")) { slashTarget = null; openSlash(slashInput); }
    else closeSlash();
  });

  /* 气泡定位 */
  document.addEventListener("selectionchange", positionBubble);
  $$("[data-format]").forEach((btn) => btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    applyFormat(btn.dataset.format, btn.dataset.value);
  }));

  /* 编辑输入 → 保存状态 */
  docBody.addEventListener("input", markDirty);
  noteTitle.addEventListener("input", markDirty);

  /* 大纲点击 */
  $$("[data-outline]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); scrollToHeading(a.dataset.outline); }));

  /* 双向链接点击（演示） */
  docBody.addEventListener("click", (e) => {
    const a = e.target.closest("a.blk-link");
    if (a) { e.preventDefault(); toast(`双向链接：跳转到「${a.textContent.trim()}」的关联笔记（演示）`); }
  });

  /* ---------- 初始化 ---------- */
  try {
    if (localStorage.getItem("knowra-softlight-theme") === "dark") root.dataset.theme = "dark";
  } catch (_) {}
  setRoute(location.hash === "#editor" ? "editor" : "home", "构建第二大脑的方法");
})();
