(() => {
  const root = document.documentElement;
  const body = document.body;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  let toastTimer;
  let saveTimer;

  const toast = (message) => {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.dataset.open = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.dataset.open = "false"; }, 1800);
  };

  const setTheme = (dark) => {
    root.classList.toggle("dark", dark);
    $$('[data-theme-icon="sun"]').forEach(el => el.classList.toggle("hidden", dark));
    $$('[data-theme-icon="moon"]').forEach(el => el.classList.toggle("hidden", !dark));
    try { localStorage.setItem("knowra-shadcn-theme", dark ? "dark" : "light"); } catch (_) {}
  };

  try { setTheme(localStorage.getItem("knowra-shadcn-theme") === "dark"); } catch (_) { setTheme(false); }

  $$('[data-action="theme"]').forEach(button => button.addEventListener("click", () => setTheme(!root.classList.contains("dark"))));
  $$('[data-action="sidebar"]').forEach(button => button.addEventListener("click", () => {
    if (innerWidth <= 720) body.classList.toggle("mobile-sidebar-open");
    else body.classList.toggle("sidebar-collapsed");
  }));
  $("#mobile-scrim")?.addEventListener("click", () => body.classList.remove("mobile-sidebar-open"));

  const commandDialog = $("#command-dialog");
  const commandInput = $("#command-input");
  const openCommand = () => {
    if (!commandDialog) return;
    commandDialog.dataset.open = "true";
    commandInput.value = "";
    $$(".command-item[data-search]").forEach(item => item.classList.remove("hidden"));
    $("#command-empty")?.style.setProperty("display", "none");
    requestAnimationFrame(() => commandInput.focus());
  };
  const closeCommand = () => { if (commandDialog) commandDialog.dataset.open = "false"; };
  $$('[data-action="command"]').forEach(button => button.addEventListener("click", openCommand));
  commandDialog?.addEventListener("mousedown", event => { if (event.target === commandDialog) closeCommand(); });
  commandInput?.addEventListener("input", () => {
    const query = commandInput.value.trim().toLowerCase();
    let visible = 0;
    $$(".command-item[data-search]").forEach(item => {
      const match = item.dataset.search.toLowerCase().includes(query);
      item.classList.toggle("hidden", !match);
      if (match) visible += 1;
    });
    $("#command-empty").style.display = visible ? "none" : "block";
  });
  $$(".command-item[data-href]").forEach(item => item.addEventListener("click", () => { location.href = item.dataset.href; }));

  $$("[data-tab]").forEach(tab => tab.addEventListener("click", () => {
    $$("[data-tab]").forEach(item => item.dataset.active = "false");
    tab.dataset.active = "true";
    const scope = tab.dataset.tab;
    $$("[data-document-type]").forEach(row => row.classList.toggle("hidden", scope !== "all" && row.dataset.documentType !== scope));
  }));

  $$("[data-action='notice']").forEach(button => button.addEventListener("click", () => toast(button.dataset.message || "操作已完成")));

  const saveStatus = $("#save-status");
  const editor = $("#editor-content");
  const noteTitle = $("#note-title");
  try {
    const savedTitle = localStorage.getItem("knowra-shadcn-title");
    const savedBody = localStorage.getItem("knowra-shadcn-editor");
    if (savedTitle !== null && noteTitle) noteTitle.textContent = savedTitle;
    if (savedBody && editor) editor.innerHTML = savedBody;
  } catch (_) {}

  const markDirty = () => {
    if (saveStatus) saveStatus.textContent = "保存中";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        if (noteTitle) localStorage.setItem("knowra-shadcn-title", noteTitle.textContent.trim());
        if (editor) localStorage.setItem("knowra-shadcn-editor", editor.innerHTML);
      } catch (_) {}
      if (saveStatus) saveStatus.textContent = "已保存";
    }, 600);
  };
  $$("[contenteditable='true']").forEach(el => el.addEventListener("input", markDirty));

  $$("[data-format]").forEach(button => button.addEventListener("mousedown", event => {
    event.preventDefault();
    document.execCommand(button.dataset.format, false, button.dataset.value || null);
    button.dataset.active = button.dataset.active === "true" ? "false" : "true";
    markDirty();
  }));

  const slashInput = $("#slash-input");
  const slashMenu = $("#slash-command");
  const openSlash = () => {
    if (!slashInput || !slashMenu) return;
    const rect = slashInput.getBoundingClientRect();
    slashMenu.style.left = `${Math.min(innerWidth - 320, Math.max(12, rect.left))}px`;
    slashMenu.style.top = `${Math.min(innerHeight - 290, rect.bottom + 6)}px`;
    slashMenu.dataset.open = "true";
  };
  const closeSlash = () => { if (slashMenu) slashMenu.dataset.open = "false"; };
  slashInput?.addEventListener("input", () => { markDirty(); slashInput.textContent.trim().startsWith("/") ? openSlash() : closeSlash(); });
  $$("[data-action='slash']").forEach(button => button.addEventListener("click", () => { slashInput?.focus(); openSlash(); }));
  $$('[data-command-type]').forEach(item => item.addEventListener("click", () => {
    slashInput.textContent = "";
    slashInput.dataset.placeholder = item.dataset.commandType === "heading" ? "输入小节标题" : item.dataset.commandType === "todo" ? "输入待办事项" : "继续写作";
    if (item.dataset.commandType === "heading") slashInput.style.fontSize = "1.35rem";
    closeSlash();
    slashInput.focus();
    toast("已切换内容块类型");
  }));

  $$("[data-outline-target]").forEach(button => button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.outlineTarget);
    target?.scrollIntoView({behavior: "smooth", block: "center"});
    $$("[data-outline-target]").forEach(item => item.dataset.active = "false");
    button.dataset.active = "true";
  }));

  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openCommand(); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b" && !event.target.isContentEditable) { event.preventDefault(); body.classList.toggle("sidebar-collapsed"); }
    if (event.key === "Escape") { closeCommand(); closeSlash(); body.classList.remove("mobile-sidebar-open"); }
  });
})();
