// 知境图标 V2（第二稿，75 个）。完全按 knowra-layered.html 原型里的图标语言重画，不参考旧图标。
// 语言：24×24 网格，默认 1.6 描边，圆角端点与转角；形体简洁几何，单色 currentColor。
// 强调色只用于 AI 星光里的小星星，写作 {A}，构建时替换为 var(--accent)。
// 第四项为该图标的描边宽度（默认 1.6）。第一稿保存在 icons-v2-draft1.mjs。

const rr = (x, y, w, h, r = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const dot = (x, y, r = 1.4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;

const PAGE = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>';
const TAG = '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8Z"/>';
const TRAY = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>';

export const GROUPS = [
  ['files-knowledge', '文件与知识', [
    ['NoteIcon', '笔记', PAGE],
    ['BookIcon', '书本', '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2ZM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z"/>'],
    ['QuestionIcon', '试题', '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/><path d="M9.6 8.6a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1 .9-1 1.6"/><path d="M12 15.2h.01" stroke-width="2.2"/>'],
    ['FolderIcon', '文件夹', '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z"/>'],
    ['TagIcon', '标签', TAG + '<path d="M7 7h.01" stroke-width="2.2"/>'],
    ['LinkIcon', '链接', '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'],
    ['PaperclipIcon', '附件', '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>'],
    ['StarIcon', '收藏', '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21.1 7 14.2 2 9.3l6.9-1Z"/>'],
    ['SparkIcon', 'AI', '<path d="m11 3 1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9Z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7Z" fill="{A}" stroke="{A}" stroke-width="1"/>'],
    ['NodesIcon', '知识图谱', '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'],
    ['TargetIcon', '目标', '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5.5"/>' + dot(12, 12, 1.2)],
    ['ClockIcon', '时间', '<circle cx="12" cy="12" r="9.5"/><path d="M12 6v6l4 2"/>'],
    ['CalendarIcon', '日历', rr(3, 4, 18, 18) + '<path d="M16 2v4M8 2v4M3 10h18"/>'],
    ['CheckIcon', '完成', '<circle cx="12" cy="12" r="9.5"/><path d="m7.8 12.3 3 3 5.4-6"/>'],
    ['UserIcon', '用户', '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'],
    ['HomeIcon', '主页', '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>'],
    ['BellIcon', '通知', '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'],
  ]],
  ['navigation', '导航与操作', [
    ['SearchIcon', '搜索', '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>'],
    ['PlusIcon', '新增', '<path d="M12 5v14M5 12h14"/>'],
    ['FilterIcon', '筛选', '<path d="M22 3H2l8 9.5V19l4 2v-8.5Z"/>'],
    ['SettingsIcon', '设置', '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 16V3M1 14h6M9 8h6M17 16h6"/>'],
    ['ArrowRightIcon', '向右', '<path d="M5 12h14M12 5l7 7-7 7"/>'],
    ['ChevronRightIcon', '右箭头', '<path d="m9 18 6-6-6-6"/>'],
    ['ChevronDownIcon', '下箭头', '<path d="m6 9 6 6 6-6"/>'],
    ['CloseIcon', '关闭', '<path d="M18 6 6 18M6 6l12 12"/>'],
    ['ArrowUpRightIcon', '跳转', '<path d="M7 17 17 7M7 7h10v10"/>'],
    ['RefreshIcon', '刷新', '<path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>'],
    ['UploadIcon', '上传', TRAY + '<path d="m17 8-5-5-5 5M12 3v12"/>'],
    ['SortArrowsIcon', '排序', '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>'],
    ['SidebarIcon', '侧栏', rr(3, 3, 18, 18) + '<path d="M9 3v18"/>'],
    ['PanelIcon', '右侧面板', rr(3, 3, 18, 18) + '<path d="M15 3v18"/>'],
    ['FocusIcon', '专注', '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>'],
    ['ComponentLibraryIcon', '组件库', rr(3, 3, 7, 7, 1.5) + rr(14, 3, 7, 7, 1.5) + rr(14, 14, 7, 7, 1.5) + rr(3, 14, 7, 7, 1.5)],
    ['MoreHorizontalIcon', '更多', dot(5, 12) + dot(12, 12) + dot(19, 12)],
    ['MoreVerticalIcon', '更多（竖）', dot(12, 5) + dot(12, 12) + dot(12, 19)],
  ]],
  ['editor', '编辑器', [
    ['CodeIcon', '代码', '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>'],
    ['ListIcon', '无序列表', '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />'],
    ['OrderedListIcon', '有序列表', '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>'],
    ['TaskListIcon', '任务列表', '<path d="m3 7 2 2 4-4M3 17l2 2 4-4M13 7h8M13 17h8"/>'],
    ['QuoteIcon', '引用', '<path d="M7 17c2.5 0 4-1.5 4-4V8H5.5v5H8M17 17c2.5 0 4-1.5 4-4V8h-5.5v5H18"/>'],
    ['TableIcon', '表格', rr(3, 3, 18, 18) + '<path d="M3 9h18M3 15h18M9 3v18"/>'],
    ['ImageIcon', '图片', rr(3, 3, 18, 18) + '<circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'],
    ['BoldIcon', '加粗', '<path d="M6 4h8a4 4 0 0 1 0 8H6ZM6 12h9a4 4 0 0 1 0 8H6Z"/>', 2],
    ['ItalicIcon', '斜体', '<path d="M19 4h-9M14 20H5M15 4 9 20"/>', 1.9],
    ['HighlightIcon', '高亮', '<path d="m9 11-5 5v4h4l5-5"/><path d="m21 9-5 5-5-5 5-5Z"/><path d="M4 20.5h16"/>'],
    ['StrikethroughIcon', '删除线', '<path d="M16 4H9.5a3.5 3.5 0 0 0-3.4 4.3M14.5 12a4 4 0 0 1 0 8H6M4 12h16"/>'],
    ['CutIcon', '剪切', '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>'],
    ['CopyIcon', '复制', rr(9, 9, 13, 13) + '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'],
    ['PasteIcon', '粘贴', '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' + rr(8, 2, 8, 4, 1)],
    ['DeleteIcon', '删除', '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>'],
    ['EditIcon', '编辑', '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'],
    ['IndentIcon', '增加缩进', '<path d="M3 5h18M11 12h10M3 19h18M3 9l3 3-3 3"/>'],
    ['OutdentIcon', '减少缩进', '<path d="M3 5h18M11 12h10M3 19h18M7 9l-3 3 3 3"/>'],
    ['HorizontalRuleIcon', '分割线', '<path d="M3 12h18"/>'],
    ['ParagraphAddIcon', '插入段落', '<path d="M4 6h16M4 12h10M4 18h5M17 15v6M14 18h6"/>'],
  ]],
  ['states', '状态', [
    ['DropdownArrowIcon', '下拉箭头', '<path d="m6 9 6 6 6-6"/>'],
    ['TreeExpandIcon', '树展开', '<path d="m9 18 6-6-6-6"/>'],
    ['SearchClearIcon', '清除搜索', '<circle cx="12" cy="12" r="9.5"/><path d="m15 9-6 6M9 9l6 6"/>'],
    ['DialogCloseIcon', '关闭弹窗', '<path d="M18 6 6 18M6 6l12 12"/>'],
    ['CheckboxCheckedIcon', '复选框选中', rr(3, 3, 18, 18, 3) + '<path d="m8 12 3 3 5-6"/>'],
    ['CheckboxIndeterminateIcon', '复选框半选', rr(3, 3, 18, 18, 3) + '<path d="M8 12h8"/>'],
    ['TagSelectedCheckIcon', '标签已选', TAG + '<path d="m8.8 12 2.2 2.2 4-4"/>'],
    ['TagRemoveIcon', '移除标签', TAG + '<path d="m9.5 9.5 5 5M14.5 9.5l-5 5"/>'],
    ['StatusDotIcon', '状态点', '<circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/>'],
  ]],
  ['future', '文件与备份', [
    ['ExpandedFolderIcon', '展开的文件夹', '<path d="M5 19a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4l2 3h7a2 2 0 0 1 2 2v2"/><path d="m3 19 2.6-8a1.8 1.8 0 0 1 1.7-1.2H21a1 1 0 0 1 1 1.3L19.8 18.3a2 2 0 0 1-1.9 1.7H5a2 2 0 0 1-2-1Z"/>'],
    ['MarkdownFileIcon', 'Markdown 文件', PAGE + '<path d="M8.8 17.5v-5l2.7 3 2.7-3v5"/>'],
    ['PdfFileIcon', 'PDF 文件', PAGE + '<path d="M9 18v-6h2.6a1.9 1.9 0 0 1 0 3.8H9"/>'],
    ['ResourceFileIcon', '资料文件', PAGE + '<path d="M8.5 13h7M8.5 17h7"/>'],
    ['DuplicateIcon', '创建副本', rr(9, 9, 13, 13) + '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/><path d="M15.5 12.5v6M12.5 15.5h6"/>'],
    ['DownloadIcon', '下载', TRAY + '<path d="m7 10 5 5 5-5M12 15V3"/>'],
    ['ExportIcon', '导出', '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>'],
    ['BackupIcon', '备份', '<ellipse cx="10" cy="5" rx="7" ry="3"/><path d="M3 5v14c0 1.7 3.1 3 7 3M17 5v4M3 12c0 1.7 3.1 3 7 3"/><circle cx="18" cy="17" r="4.5"/><path d="M18 14.8V17l1.6 1"/>'],
    ['RestoreIcon', '恢复', '<path d="M1 4v6h6"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/><path d="M12 8v4l3 2"/>'],
    ['UndoIcon', '撤销', '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>'],
    ['RedoIcon', '重做', '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>'],
  ]],
];
