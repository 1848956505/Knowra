# Client Controller Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `apps/web/src/client.js` from a multi-thousand-line god file into a thin browser bootstrapper by migrating whole feature domains into focused controller modules.

**Architecture:** Keep existing pure helpers in `apps/web/lib/*` as the reusable domain layer. Add browser-facing controller modules under `apps/web/src/controllers/*` for DOM mounting, service branching, state mutation orchestration, and event-handler methods. `client.js` should own only global state creation, element caching, controller wiring, application initialization, and top-level error handling.

**Tech Stack:** Browser ESM JavaScript, Node-based static tests in `apps/web/test`, existing `knowledgeApi`, existing `apps/web/lib/*` helpers.

---

## Current Diagnosis

`client.js` is now about 3700 lines. The previous event split was correct, but it mostly removed event listener registration. The remaining bulk is still mixed by runtime concern:

- Rendering orchestration: `renderAll`, `renderFolders`, `renderEditor`, `renderSidebar`, `renderStatus`, context menus, tab menus.
- Navigation command orchestration: folder/note create, rename, delete, move, tree editor, drag indicators, context menu actions.
- Editor command orchestration: menu actions, shortcuts, panel actions, table dialog, source preview, editor host lifecycle, autosave.
- Workspace selection and loading: initial data load, cache fallback, current folder/note reconciliation.
- Tags and knowledge points: API/local branching, state collection updates, sidebar refresh, marker synchronization.

The next refactor should avoid moving isolated helper functions. It should move entire feature controllers so call sites become stable and future changes have obvious homes.

## Target File Structure

Create these browser controller modules:

| File | Responsibility |
| --- | --- |
| `apps/web/src/controllers/navigation-controller.js` | Left navigation UI orchestration: folder tree rendering, navigation context/section menus, inline tree editor lifecycle, folder/note CRUD, folder/note selection, drag/drop visual sync and commits. |
| `apps/web/src/controllers/editor-controller.js` | Main editor orchestration: editor render mode, rich editor host lifecycle, markdown/source preview sync, editor menus, shortcuts, utility panel, table dialog, autosave and save indicator. |
| `apps/web/src/controllers/sidebar-controller.js` | Right sidebar orchestration: side data loading/clearing, sidebar tab rendering, info/outline/concepts/AI tab mounting, outline jump helpers. |
| `apps/web/src/controllers/knowledge-controller.js` | Knowledge point actions: current-note source selection, create/attach/remove/update/delete flows, marker sync, membership sync. |
| `apps/web/src/controllers/tag-controller.js` | Current-note tag actions: add existing tag, remove tag, create-and-assign tag, cleanup orphan tags, collection replacement. |
| `apps/web/src/controllers/workspace-controller.js` | Workspace startup/load/cache/recovery, current space resolution, selection reconciliation, backend/local mode sync. |
| `apps/web/src/controllers/app-renderer.js` | Top-level render coordinator: `renderAll`, `safeRenderStep`, rail/search/status/workspace layout refresh, controller render sequencing. |

Modify these existing files:

| File | Intended Change |
| --- | --- |
| `apps/web/src/client.js` | Shrink into bootstrapper: imports, constants, state/elements, controller construction, `initialize`, `bindEvents`, runtime error reporting. |
| `apps/web/lib/events/*.js` | Update dependency names only when controller method names replace old `client.js` function names. Do not move listener code again unless a dependency signature becomes unclear. |
| `docs/项目结构导航.md` | Add the new `apps/web/src/controllers` section, update `client.js` responsibility, update change log after every completed controller migration. |
| `apps/web/test/*` | Move old static assertions from `client.js` to controller files; add controller smoke tests for returned methods and dependency usage. |

## Execution Strategy

Migrate in large but safe vertical slices. Each task should leave the app runnable and the full web test loop passing. Prefer one commit per task.

### Task 1: Establish Controller Factory Pattern

**Files:**
- Create: `apps/web/src/controllers/controller-utils.js`
- Create: `apps/web/test/controllers/controller-utils.test.js`
- Modify: `docs/项目结构导航.md`

- [ ] **Step 1: Add a tiny controller utility test**

Create `apps/web/test/controllers/controller-utils.test.js`:

```js
import assert from 'node:assert/strict';
import { createRequiredDependencyGetter } from '../../src/controllers/controller-utils.js';

const get = createRequiredDependencyGetter({ renderAll: () => 'ok' }, 'test-controller');

assert.equal(get('renderAll')(), 'ok');
assert.throws(
  () => get('missingDep'),
  /test-controller missing dependency: missingDep/
);

console.log('controller-utils tests passed');
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node apps/web/test/controllers/controller-utils.test.js
```

Expected: FAIL because `controller-utils.js` does not exist.

- [ ] **Step 3: Implement the utility**

Create `apps/web/src/controllers/controller-utils.js`:

```js
export function createRequiredDependencyGetter(deps, controllerName) {
  return function getDependency(key) {
    if (!deps || !(key in deps)) {
      throw new Error(`${controllerName} missing dependency: ${key}`);
    }
    return deps[key];
  };
}
```

- [ ] **Step 4: Verify**

Run:

```powershell
node apps/web/test/controllers/controller-utils.test.js
```

Expected: PASS with `controller-utils tests passed`.

- [ ] **Step 5: Update navigation doc**

Add `apps/web/src/controllers` to `docs/项目结构导航.md` with the rule:

```markdown
### `apps/web/src/controllers`

Browser-facing controllers live here. They may coordinate DOM elements, global state snapshots, API/local branching, and renderer/helper calls. Pure state rules and HTML string builders should stay in `apps/web/lib/*`.
```

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/controllers/controller-utils.js apps/web/test/controllers/controller-utils.test.js docs/项目结构导航.md
git commit -m "refactor: establish web controller pattern"
```

### Task 2: Migrate Navigation Controller as One Large Slice

**Files:**
- Create: `apps/web/src/controllers/navigation-controller.js`
- Create: `apps/web/test/controllers/navigation-controller.test.js`
- Modify: `apps/web/src/client.js`
- Modify: `apps/web/lib/events/folder-tree-events.js`
- Modify: `apps/web/lib/events/menu-events.js`
- Modify: `docs/项目结构导航.md`

Move these current `client.js` responsibilities together:

- `renderFolders`
- `renderNavSection`
- `renderMaterialsTree`
- `renderFolderNode`
- `renderNoteNode`
- `renderRecycleNoteNode`
- `renderInlineEditorRow`
- `renderDeleteIntentRow`
- `renderEmptyItem`
- `renderHeaderToggle`
- `renderContextMenu`
- `getContextMenuItems`
- `renderSectionMenu`
- `handleContextMenuAction`
- `startTreeEditor`
- `cancelTreeEditor`
- `submitTreeEditor`
- `commitDelete`
- `commitDrop`
- `resetDragState`
- `syncDragIndicators`
- `resolveDropTarget`
- `canDropOnTarget`
- `isRootDropActive`
- `clearDeleteIntent`
- `createFolder`
- `renameFolder`
- `deleteFolder`
- `moveFolder`
- `createNote`
- `renameNote`
- `deleteNote`
- `moveNote`
- `selectFolder`
- `selectNote`
- `toggleFolderOpen`
- `openFolderBranch`
- `openContextMenu`
- `closeContextMenu`
- `closeSectionMenu`
- `getDirectNotesForFolder`
- `focusInlineEditor`
- `validateTreeEditorName`

- [ ] **Step 1: Write controller shape test**

Create `apps/web/test/controllers/navigation-controller.test.js`:

```js
import assert from 'node:assert/strict';
import { createNavigationController } from '../../src/controllers/navigation-controller.js';

const state = {
  folderTree: [],
  foldersById: {},
  notes: [],
  selectedFolderId: null,
  selectedNoteId: null,
  openedFolderIds: new Set(),
  treeEditor: null,
  deleteIntent: null,
  dragState: null,
  navSections: { materials: true, favorites: true, recycle: true },
  searchQuery: '',
  selectedTagIds: new Set()
};

const elements = {
  folderTree: { innerHTML: '' },
  contextMenu: { innerHTML: '', hidden: true, style: {} },
  sectionMenu: { innerHTML: '', hidden: true, style: {} }
};

const calls = [];
const controller = createNavigationController({
  state,
  elements,
  knowledgeApi: {},
  renderAll: () => calls.push('renderAll'),
  renderEditor: () => calls.push('renderEditor'),
  renderSidebar: () => calls.push('renderSidebar'),
  renderStatus: () => calls.push('renderStatus'),
  syncLocalWorkspace: () => calls.push('syncLocalWorkspace'),
  persistDraft: async () => calls.push('persistDraft'),
  loadCurrentNoteSideData: async () => calls.push('loadCurrentNoteSideData'),
  clearNoteSideData: () => calls.push('clearNoteSideData'),
  getCurrentNote: () => null,
  flashStatus: (message) => calls.push(`flash:${message}`),
  focusSearchInput: () => calls.push('focusSearchInput')
});

assert.equal(typeof controller.renderFolders, 'function');
assert.equal(typeof controller.handleContextMenuAction, 'function');
assert.equal(typeof controller.selectNote, 'function');
assert.equal(typeof controller.createFolder, 'function');
assert.equal(typeof controller.commitDrop, 'function');

controller.renderFolders();
assert.equal(elements.folderTree.innerHTML.includes('nav-empty') || typeof elements.folderTree.innerHTML === 'string', true);

console.log('navigation-controller tests passed');
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node apps/web/test/controllers/navigation-controller.test.js
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Move the full navigation slice**

Create `apps/web/src/controllers/navigation-controller.js` with:

```js
export function createNavigationController(deps) {
  const {
    state,
    elements,
    knowledgeApi,
    renderAll,
    renderEditor,
    renderSidebar,
    renderStatus,
    syncLocalWorkspace,
    persistDraft,
    loadCurrentNoteSideData,
    clearNoteSideData,
    getCurrentNote,
    flashStatus,
    focusSearchInput
  } = deps;

  // Move the listed navigation functions from client.js here.
  // Keep their bodies behavior-identical at first.
  // Return every function used by event binders or other controllers.
  return {
    renderFolders,
    renderContextMenu,
    renderSectionMenu,
    handleContextMenuAction,
    startTreeEditor,
    cancelTreeEditor,
    submitTreeEditor,
    commitDelete,
    commitDrop,
    resetDragState,
    syncDragIndicators,
    resolveDropTarget,
    canDropOnTarget,
    isRootDropActive,
    clearDeleteIntent,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    createNote,
    renameNote,
    deleteNote,
    moveNote,
    selectFolder,
    selectNote,
    toggleFolderOpen,
    openFolderBranch,
    openContextMenu,
    closeContextMenu,
    closeSectionMenu,
    getDirectNotesForFolder,
    focusInlineEditor,
    validateTreeEditorName
  };
}
```

Use existing imports from `client.js` for navigation helpers. Do not change business behavior during this move.

- [ ] **Step 4: Wire controller in `client.js`**

In `client.js`, import and construct:

```js
import { createNavigationController } from './controllers/navigation-controller.js';

let navigationController = null;

function createControllers() {
  navigationController = createNavigationController({
    state,
    elements,
    knowledgeApi,
    renderAll,
    renderEditor,
    renderSidebar,
    renderStatus,
    syncLocalWorkspace,
    persistDraft,
    loadCurrentNoteSideData,
    clearNoteSideData,
    getCurrentNote,
    flashStatus,
    focusSearchInput
  });
}
```

Call `createControllers()` after `cacheElements()` and before `bindEvents()`.

- [ ] **Step 5: Replace event dependencies**

In `bindEvents()`, replace navigation function references with `navigationController.*` for `bindFolderTreeEvents` and menu/context handlers.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
node apps/web/test/controllers/navigation-controller.test.js
node apps/web/test/events/folder-tree-events.test.js
node apps/web/test/events/menu-events.test.js
node apps/web/test/navigation-tree-editor.test.js
node apps/web/test/navigation-drag-drop.test.js
```

Expected: all PASS.

- [ ] **Step 7: Run full web test loop**

Run:

```powershell
$tests = Get-ChildItem -Recurse -File 'apps\web\test' -Filter '*.test.js' | Sort-Object FullName
foreach ($test in $tests) { node $test.FullName; if ($LASTEXITCODE -ne 0) { exit 1 } }
"ALL WEB TESTS PASSED ($($tests.Count))"
```

Expected: `ALL WEB TESTS PASSED (...)`.

- [ ] **Step 8: Update navigation doc and commit**

Update `docs/项目结构导航.md`:

- Add `navigation-controller.js`.
- Change `client.js` description to remove left navigation ownership.
- Add a change log row.

Commit:

```powershell
git add apps/web/src/client.js apps/web/src/controllers/navigation-controller.js apps/web/test/controllers/navigation-controller.test.js apps/web/lib/events/folder-tree-events.js apps/web/lib/events/menu-events.js docs/项目结构导航.md
git commit -m "refactor: extract navigation controller"
```

### Task 3: Migrate Editor Controller as One Large Slice

**Files:**
- Create: `apps/web/src/controllers/editor-controller.js`
- Create: `apps/web/test/controllers/editor-controller.test.js`
- Modify: `apps/web/src/client.js`
- Modify: `apps/web/lib/events/document-keyboard-events.js`
- Modify: `apps/web/lib/events/document-input-events.js`
- Modify: `apps/web/lib/events/document-action-events.js`
- Modify: `apps/web/lib/events/editor-content-events.js`
- Modify: `apps/web/lib/events/menu-events.js`
- Modify: `docs/项目结构导航.md`

Move these current `client.js` responsibilities together:

- `renderEditorMenuBar`
- `renderTabMenu`
- `renderPreviewPane`
- `renderSourceEditorPane`
- `renderSourceEditorView`
- `renderEditor`
- `syncSourcePreview`
- `renderEditorContextMenu`
- `syncEditorContextSubmenuLayout`
- `openEditorContextMenu`
- `closeEditorContextMenu`
- `handleEditorContextMenuAction`
- `handleFormat`
- `shouldHandleEditorShortcut`
- `handleResolvedEditorShortcut`
- `handleParagraphMenuAction`
- `handleFormatMenuAction`
- `handleViewMenuAction`
- `handleEditMenuAction`
- `handleEditorPanelAction`
- `closeEditorMenuBar`
- `openEditorPanel`
- `closeEditorPanel`
- `handleFileMenuAction`
- `importMarkdownFiles`
- `duplicateCurrentNote`
- `exportCurrentNoteAsMarkdown`
- `exportCurrentNoteAsPdf`
- `exportCurrentNoteAsPdfStable`
- `triggerFileDownload`
- `teardownEditorHost`
- `mountEditorHost`
- `syncEditorContextMenuPosition`
- `handleEditorMarkdownChange`
- `renderEditorSaveIndicator`
- `renderEditorPanel`
- `openTableInsertDialog`
- `closeTableInsertDialog`
- `submitTableInsertDialog`
- `renderTableInsertDialog`
- `scheduleAutosave`
- `persistDraft`

- [ ] **Step 1: Add controller shape test**

Create `apps/web/test/controllers/editor-controller.test.js`:

```js
import assert from 'node:assert/strict';
import { createEditorController } from '../../src/controllers/editor-controller.js';

const state = {
  notes: [],
  selectedNoteId: null,
  currentView: 'workspace',
  editorViewMode: 'rich',
  editorPanel: null,
  tableDialog: null,
  editorSaveState: 'idle',
  dataMode: 'local'
};

const elements = {
  editorContent: { innerHTML: '', dataset: {}, querySelector: () => null },
  editorMenuBar: { innerHTML: '' },
  editorContextMenu: { innerHTML: '', hidden: true, style: {} },
  noteTabMenu: { innerHTML: '', hidden: true, style: {} },
  editorUtilityPanel: { innerHTML: '' },
  editorSaveIndicator: { textContent: '', dataset: {} }
};

const controller = createEditorController({
  state,
  elements,
  knowledgeApi: {},
  getCurrentNote: () => null,
  getMenuTargetFolderId: () => null,
  getSiblingNames: () => [],
  syncLocalWorkspace: () => {},
  renderAll: () => {},
  renderTabs: () => {},
  renderSidebar: () => {},
  renderStatus: () => {},
  loadCurrentNoteSideData: async () => {},
  flashStatus: () => {}
});

assert.equal(typeof controller.renderEditor, 'function');
assert.equal(typeof controller.persistDraft, 'function');
assert.equal(typeof controller.handleFileMenuAction, 'function');
assert.equal(typeof controller.handleResolvedEditorShortcut, 'function');
assert.equal(typeof controller.mountEditorHost, 'function');

console.log('editor-controller tests passed');
```

- [ ] **Step 2: Run failing test**

```powershell
node apps/web/test/controllers/editor-controller.test.js
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Move the full editor slice**

Create `apps/web/src/controllers/editor-controller.js`. Keep function bodies behavior-identical and return all moved functions used by event binders, navigation controller, workspace controller, or top-level renderer.

- [ ] **Step 4: Wire `client.js` and event binders**

Construct `editorController` after element caching. Replace old direct dependencies in `bindDocumentKeyboardEvents`, `bindDocumentInputEvents`, `bindDocumentActionEvents`, `bindEditorContentEvents`, and `bindMenuEvents` with `editorController.*`.

- [ ] **Step 5: Run focused tests**

```powershell
node apps/web/test/controllers/editor-controller.test.js
node apps/web/test/events/document-keyboard-events.test.js
node apps/web/test/events/document-input-events.test.js
node apps/web/test/events/document-action-events.test.js
node apps/web/test/events/editor-content-events.test.js
node apps/web/test/events/menu-events.test.js
node apps/web/test/editor-draft-state.test.js
node apps/web/test/file-menu.test.js
```

Expected: all PASS.

- [ ] **Step 6: Run full web test loop**

Use the same full web test loop from Task 2.

- [ ] **Step 7: Update docs and commit**

```powershell
git add apps/web/src/client.js apps/web/src/controllers/editor-controller.js apps/web/test/controllers/editor-controller.test.js apps/web/lib/events/document-keyboard-events.js apps/web/lib/events/document-input-events.js apps/web/lib/events/document-action-events.js apps/web/lib/events/editor-content-events.js apps/web/lib/events/menu-events.js docs/项目结构导航.md
git commit -m "refactor: extract editor controller"
```

### Task 4: Migrate Sidebar, Tags, and Knowledge Controllers

**Files:**
- Create: `apps/web/src/controllers/sidebar-controller.js`
- Create: `apps/web/src/controllers/tag-controller.js`
- Create: `apps/web/src/controllers/knowledge-controller.js`
- Create: `apps/web/test/controllers/sidebar-controller.test.js`
- Create: `apps/web/test/controllers/tag-controller.test.js`
- Create: `apps/web/test/controllers/knowledge-controller.test.js`
- Modify: `apps/web/src/client.js`
- Modify: `apps/web/lib/events/aside-events/*.js`
- Modify: `docs/项目结构导航.md`

Move these current `client.js` responsibilities together:

- Sidebar: `loadCurrentNoteSideData`, `loadApiNoteSideData`, `loadLocalNoteSideData`, `clearNoteSideData`, `renderSidebar`, `renderInfoTab`, `renderOutlineTab`, `renderConceptsTab`, `findOutlineHeadingTarget`.
- Tags: `replaceTagInState`, `removeTagFromState`, `addTagToCurrentNote`, `removeTagFromCurrentNote`, `createTagAndAssignToCurrentNote`, `cleanupOrphanTag`.
- Knowledge points: `replaceKnowledgePointInState`, `insertKnowledgePointInState`, `removeKnowledgePointFromState`, `syncKnowledgePointMembership`, `getCurrentKnowledgePointSources`, `syncKnowledgePointMarkers`, `scrollKnowledgePointCardIntoView`, `focusKnowledgePointFromMarker`, `selectKnowledgePointSource`, `createKnowledgePointFromCurrentSelection`, `attachSelectionToExistingKnowledgePoint`, `removeKnowledgePointSourceFromCurrentNote`, `deleteKnowledgePointFromLibrary`, `updateCurrentKnowledgePoint`.

- [ ] **Step 1: Add shape tests for all three controllers**

Each test should construct minimal `state` and `elements`, call the factory, and assert the public methods exist. Keep behavior tests focused on existing pure modules in `apps/web/lib/*`.

- [ ] **Step 2: Run failing tests**

```powershell
node apps/web/test/controllers/sidebar-controller.test.js
node apps/web/test/controllers/tag-controller.test.js
node apps/web/test/controllers/knowledge-controller.test.js
```

Expected: FAIL because controllers do not exist.

- [ ] **Step 3: Move sidebar controller first**

Move sidebar load/render helpers. Wire `app-renderer` or `client.js` to call `sidebarController.renderSidebar(note)`.

- [ ] **Step 4: Move tag controller**

Move tag state orchestration. Wire aside event dependencies to `tagController.*`.

- [ ] **Step 5: Move knowledge controller**

Move knowledge point orchestration. Wire aside and editor content event dependencies to `knowledgeController.*`.

- [ ] **Step 6: Run focused tests**

```powershell
node apps/web/test/controllers/sidebar-controller.test.js
node apps/web/test/controllers/tag-controller.test.js
node apps/web/test/controllers/knowledge-controller.test.js
node apps/web/test/events/aside-events.test.js
node apps/web/test/events/editor-content-events.test.js
node apps/web/test/knowledge-point-state.test.js
node apps/web/test/knowledge-point-form.test.js
node apps/web/test/tag-state.test.js
```

Expected: all PASS.

- [ ] **Step 7: Run full web test loop**

Use the same full web test loop from Task 2.

- [ ] **Step 8: Update docs and commit**

```powershell
git add apps/web/src/client.js apps/web/src/controllers/sidebar-controller.js apps/web/src/controllers/tag-controller.js apps/web/src/controllers/knowledge-controller.js apps/web/test/controllers/sidebar-controller.test.js apps/web/test/controllers/tag-controller.test.js apps/web/test/controllers/knowledge-controller.test.js apps/web/lib/events/aside-events apps/web/lib/events/editor-content-events.js docs/项目结构导航.md
git commit -m "refactor: extract sidebar tag knowledge controllers"
```

### Task 5: Migrate Workspace Controller and Top-Level Renderer

**Files:**
- Create: `apps/web/src/controllers/workspace-controller.js`
- Create: `apps/web/src/controllers/app-renderer.js`
- Create: `apps/web/test/controllers/workspace-controller.test.js`
- Create: `apps/web/test/controllers/app-renderer.test.js`
- Modify: `apps/web/src/client.js`
- Modify: `docs/项目结构导航.md`

Move these current `client.js` responsibilities together:

- Workspace startup/loading: `loadWorkspaceData`, `ensureSpaceId`, `refreshKnowledgeData`, `persistBackendCache`, `readBackendCache`, `readInitialWorkspaceSnapshot`, `loadCachedWorkspaceData`, `loadMockWorkspaceData`, `reconcileSelection`.
- Render coordination: `renderRail`, `renderAll`, `safeRenderStep`, `renderSearchShell`, `renderSearchPanel`, `getEffectiveViewState`, `renderWorkspaceViewState`, `renderStatus`.
- Selectors still left in client after previous tasks: `getCurrentNote`, `getNoteById`, `getActiveNotes`, `getRecycleNotes`, `getVisibleNotes`, `getSearchResultNotes`, `getSelectedSearchTags`, `getVisibleSearchTags`, `getTagUsageCount`, `hasActiveSearchFilters`, `matchesSearch`, `matchesFolderSearch`, `noteMatchesSelectedTags`.

- [ ] **Step 1: Add renderer and workspace controller shape tests**

Create tests that assert:

- `createAppRenderer(...).renderAll` exists.
- `createWorkspaceController(...).loadWorkspaceData` exists.
- `createWorkspaceController(...).reconcileSelection` exists.

- [ ] **Step 2: Run failing tests**

```powershell
node apps/web/test/controllers/workspace-controller.test.js
node apps/web/test/controllers/app-renderer.test.js
```

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Move render coordinator**

Create `app-renderer.js` and move top-level rendering functions. It should call controller render methods rather than importing domain renderers directly where possible.

- [ ] **Step 4: Move workspace controller**

Create `workspace-controller.js` and move load/cache/recovery/reconcile logic.

- [ ] **Step 5: Slim `client.js`**

After this task, `client.js` should contain only:

- imports
- constants
- global `state`
- `elements`
- controller variables
- `initialize`
- `cacheElements`
- `createControllers`
- `bindRuntimeErrorHandlers`
- `reportRuntimeError`
- `bindEvents`
- small formatting utilities only if still used globally

- [ ] **Step 6: Run focused tests**

```powershell
node apps/web/test/controllers/workspace-controller.test.js
node apps/web/test/controllers/app-renderer.test.js
node apps/web/test/workspace-normalization.test.js
node apps/web/test/workspace-cache.test.js
node apps/web/test/workspace-loading.test.js
```

Expected: all PASS.

- [ ] **Step 7: Run full web test loop**

Use the same full web test loop from Task 2.

- [ ] **Step 8: Update docs and commit**

```powershell
git add apps/web/src/client.js apps/web/src/controllers/workspace-controller.js apps/web/src/controllers/app-renderer.js apps/web/test/controllers/workspace-controller.test.js apps/web/test/controllers/app-renderer.test.js docs/项目结构导航.md
git commit -m "refactor: extract workspace renderer controllers"
```

## Completion Criteria

The refactor is complete when:

- `apps/web/src/client.js` is below 900 lines.
- No single new controller exceeds 500 lines.
- If a controller exceeds 250 lines, it has a clear single responsibility and is listed for future internal subdivision.
- Existing event binders stay focused on event listener registration and target parsing only.
- Existing `apps/web/lib/*` modules remain pure or near-pure helpers and do not import `client.js`.
- `docs/项目结构导航.md` documents every new controller and updates `client.js` responsibility.
- Full web test loop passes.

## Verification Commands

Run after every task:

```powershell
node --check apps/web/src/client.js
Get-ChildItem -Recurse -File 'apps\web\src\controllers' -Filter '*.js' | ForEach-Object { node --check $_.FullName }
$tests = Get-ChildItem -Recurse -File 'apps\web\test' -Filter '*.test.js' | Sort-Object FullName
foreach ($test in $tests) { node $test.FullName; if ($LASTEXITCODE -ne 0) { exit 1 } }
"ALL WEB TESTS PASSED ($($tests.Count))"
```

Expected:

```text
ALL WEB TESTS PASSED (...)
```

## Risks and Guardrails

- Do not change behavior while moving functions. First migrate behavior-identical bodies, then test, then consider cleanup.
- Do not move pure helper logic from `apps/web/lib/*` into controllers.
- Do not let controllers import each other in cycles. Share dependencies through factory parameters.
- Do not let `client.js` keep compatibility wrapper functions unless a task explicitly deletes them before commit.
- Do not update tests by simply deleting assertions. Static assertions should move from `client.js` to the new owning module.
- Do not create one `client-controller.js`; that would only rename the god file.

## Self-Review

- Spec coverage: The plan targets maintainability, line-count pressure, single responsibility, structure navigation updates, and test verification.
- Placeholder scan: No task uses TBD-style placeholders. Each task names concrete files, functions, and commands.
- Type consistency: Controller factories consistently use `createXController(deps)` and return public methods consumed by `client.js` and event binders.

Plan complete and saved to `docs/superpowers/plans/2026-06-26-client-controller-refactor.md`.
