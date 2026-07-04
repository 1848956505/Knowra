# Botanical Herbarium UI Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone static HTML demo for the knowledge-base note page using the confirmed Botanical Herbarium / Formal Archive visual direction.

**Architecture:** Create an isolated theme demo folder that is not imported by the production app. Keep the demo portable by placing markup and CSS in one HTML file, with a small README documenting the visual direction and how to open it.

**Tech Stack:** Static HTML, internal CSS, no runtime dependencies, local browser file opening.

---

## File Structure

- Create: `apps/web/styles/UI主题/植物标本馆/herbarium-archive-demo.html`
  - Complete static visual demo for the knowledge-base note page.
  - Contains internal CSS tokens, layout CSS, component styles, and realistic static content.
- Create: `apps/web/styles/UI主题/植物标本馆/README.md`
  - Documents the theme intent, open method, and non-production status.
- Modify: `apps/web/styles/README.md`
  - Add the new demo entry to the visual demo navigation table.

## Task 1: Create Demo Shell

**Files:**
- Create: `apps/web/styles/UI主题/植物标本馆/herbarium-archive-demo.html`

- [ ] **Step 1: Create the theme folder and HTML document**

Create a complete HTML file with:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>植物标本馆 · 知识库静态 UI Demo</title>
</head>
<body>
  <main class="herbarium-demo-shell" aria-label="植物标本馆知识库静态 UI Demo">
  </main>
</body>
</html>
```

- [ ] **Step 2: Add CSS tokens**

Add internal CSS variables for the confirmed palette:

```css
:root {
  --herb-green-900: #173425;
  --herb-green-800: #214833;
  --herb-green-700: #2f6146;
  --paper-100: #fffaf0;
  --paper-200: #f5ecd7;
  --archive-300: #d8c8a2;
  --brass-500: #9b7630;
  --moss-500: #75866d;
  --ink-900: #1f2b22;
}
```

- [ ] **Step 3: Add the main workspace grid**

The body should render a desktop workspace with:

- Global vertical rail.
- Top archive command bar.
- Left catalog panel.
- Central mounted note sheet.
- Right specimen metadata rail.
- Bottom status strip.

## Task 2: Build Static UI Content

**Files:**
- Modify: `apps/web/styles/UI主题/植物标本馆/herbarium-archive-demo.html`

- [ ] **Step 1: Add global rail and top bar content**

Include static labels and controls:

- `HERBARIUM`
- `资料`, `知识`, `题库`, `复盘`
- Search placeholder `搜索标本编号、笔记、标签`
- Buttons `导入资料`, `新建标本卡`

- [ ] **Step 2: Add left catalog panel**

Include realistic sections:

- `馆藏目录`
- Collections: `植物认知`, `概念标本`, `复习温室`, `田野摘录`
- Note rows with IDs such as `HB-042`, `HB-039`, `FOLIO-17`.

- [ ] **Step 3: Add center note sheet**

Use the title `叶脉结构与记忆路径`.
Show tabs, a compact toolbar, metadata, prose paragraphs, a quote block, an archive callout, and inline highlights.

- [ ] **Step 4: Add right metadata rail**

Include:

- Tags: `#叶脉`, `#分类`, `#记忆路径`, `#观察法`, `#概念标本`
- Outline items.
- Related references.
- Note properties such as catalog ID, created date, updated date, and word count.

- [ ] **Step 5: Add responsive behavior**

At widths below `980px`, stack the catalog, note sheet, and metadata rail while keeping the demo readable.

## Task 3: Add Documentation And Navigation

**Files:**
- Create: `apps/web/styles/UI主题/植物标本馆/README.md`
- Modify: `apps/web/styles/README.md`

- [ ] **Step 1: Add README**

Create a README with:

```md
# 植物标本馆

独立静态视觉 demo，探索知识库/记笔记页面的“植物标本馆 · 正统馆藏档案式”方向。

入口：`herbarium-archive-demo.html`

该目录不会被主应用自动加载；若后续选为正式方向，需要再抽取 token 和组件样式。
```

- [ ] **Step 2: Update styles demo navigation**

Add a row to `apps/web/styles/README.md`:

```md
| `植物标本馆` | `herbarium-archive-demo.html` | 植物标本馆方向：馆藏编号、标本纸面、深绿书脊、档案索引和知识库笔记工作台。 |
```

## Task 4: Verify Static Demo

**Files:**
- Verify: `apps/web/styles/UI主题/植物标本馆/herbarium-archive-demo.html`
- Verify: `apps/web/styles/UI主题/植物标本馆/README.md`
- Verify: `apps/web/styles/README.md`

- [ ] **Step 1: Check target files exist**

Run:

```powershell
Test-Path 'apps\web\styles\UI主题\植物标本馆\herbarium-archive-demo.html'
Test-Path 'apps\web\styles\UI主题\植物标本馆\README.md'
```

Expected: both commands print `True`.

- [ ] **Step 2: Check HTML shape**

Run:

```powershell
Select-String -Path 'apps\web\styles\UI主题\植物标本馆\herbarium-archive-demo.html' -Pattern '<!doctype html>|herbarium-demo-shell|叶脉结构与记忆路径|HB-042'
```

Expected: all four patterns are found.

- [ ] **Step 3: Confirm production styles are not importing the demo**

Run:

```powershell
Select-String -Path 'apps\web\src\styles.css','apps\web\styles\components.css' -Pattern '植物标本馆|herbarium-archive'
```

Expected: no matches.

- [ ] **Step 4: Inspect git diff**

Run:

```powershell
git diff -- apps/web/styles/UI主题/植物标本馆 apps/web/styles/README.md
```

Expected: diff only creates the new isolated demo folder and adds the navigation row.
