import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const editorHostControllerJs = fs.readFileSync(path.resolve(__dirname, '../src/controllers/editor/host-controller.js'), 'utf8');
const menuRenderersJs = fs.readFileSync(path.resolve(__dirname, '../lib/editor/menu-renderers.js'), 'utf8');
const editorContextModelJs = fs.readFileSync(path.resolve(__dirname, '../lib/editor/context-menu-model.js'), 'utf8');
const milkdownEntry = fs.readFileSync(path.resolve(__dirname, '../lib/editor/milkdown-entry.js'), 'utf8');
const componentsCss = fs.readFileSync(path.resolve(__dirname, '../styles/components.css'), 'utf8');
const enhancedImageBlock = fs.readFileSync(path.resolve(__dirname, '../lib/editor/enhanced-image-block.js'), 'utf8');
const buildScript = fs.readFileSync(path.resolve(__dirname, '../../../scripts/build-milkdown-bundle.mjs'), 'utf8');

assert.match(
  menuRenderersJs,
  /const FORMAT_MENU_ITEMS = \[[\s\S]*\{ key: 'image', label: '图片' \}[\s\S]*\];/,
  'format menu should expose an image insertion entry'
);

assert.match(
  editorContextModelJs,
  /EDITOR_CONTEXT_INSERT_ITEMS = \[[\s\S]*'image'[\s\S]*\];/,
  'context menu insert submenu should expose image insertion'
);

assert.match(
  editorContextModelJs,
  /image: \{ label: '图片' \}/,
  'image insertion should have a localized menu label'
);

assert.match(
  milkdownEntry,
  /import \{[^}]*imageBlockConfig[^}]*defaultImageBlockConfig[^}]*\} from '@milkdown\/components\/image-block';/,
  'editor host should reuse the official Milkdown image-block config from source'
);

assert.match(
  milkdownEntry,
  /import \{ enhancedImageBlockComponent \} from '\.\/enhanced-image-block\.js';/,
  'editor host should import the local enhanced image-block plugin'
);

assert.match(
  milkdownEntry,
  /\.use\(enhancedImageBlockComponent\)/,
  'editor host should register the local enhanced image-block plugin in the Milkdown pipeline'
);

assert.match(
  milkdownEntry,
  /\.use\(insertImageBlockCommand\)/,
  'editor host should register the image insertion command plugin'
);

assert.match(
  milkdownEntry,
  /\.use\(insertLinkCommand\)/,
  'editor host should register the link insertion command plugin'
);

assert.match(
  milkdownEntry,
  /\.use\(insertInternalLinkCommand\)/,
  'editor host should register the internal-link insertion command plugin'
);

assert.match(
  milkdownEntry,
  /\.use\(turnIntoTaskListCommand\)/,
  'editor host should register the task-list insertion command plugin'
);

assert.match(
  milkdownEntry,
  /ctx\.set\(imageBlockConfig\.key, \{[\s\S]*onUpload: async \(file\) =>/,
  'image-block configuration should provide an upload handler'
);

assert.match(
  milkdownEntry,
  /uploadButton:\s*'上传'[\s\S]*uploadPlaceholderText:\s*'或粘贴图片链接'[\s\S]*confirmButton:\s*`[\s\S]*<svg[\s\S]*`/,
  'image-block configuration should localize the empty-state actions and use a compact icon confirm control'
);

assert.match(
  milkdownEntry,
  /\/api\/storage\/attachments/,
  'image uploads should go through the attachment storage endpoint'
);

assert.match(
  milkdownEntry,
  /image: \(\) => \(\{ key: insertImageBlockCommand\.key \}\)/,
  'image command should insert an image-block node instead of raw markdown'
);

assert.match(
  editorHostControllerJs,
  /createMilkdownHost\(\{\s*root,\s*markdown,\s*noteId,\s*onChange: handleEditorMarkdownChange\s*\}\)/,
  'editor host should receive the active note id so uploads can target the current note'
);

assert.match(
  milkdownEntry,
  /refreshImageBlockLayouts\(\)|scheduleImageLayoutRefresh\(\)|ResizeObserver/,
  'editor host should re-run image sizing after layout changes'
);

assert.match(
  componentsCss,
  /\.milkdown-image-block[\s\S]*\.image-toolbar[\s\S]*\.image-stage/,
  'editor styles should include image-block layout rules'
);

assert.match(
  componentsCss,
  /\.image-resize-handle[\s\S]*\.milkdown-resize-handle/,
  'editor styles should keep proportional resize handles visible and usable'
);

assert.doesNotMatch(
  milkdownEntry,
  /ImageOverlayResizer|attachImageResizer\(/,
  'editor host should not keep the legacy overlay resizer once source-level image plugin takes over'
);

assert.match(
  enhancedImageBlock,
  /computeFittedImageDimensions|computeResizeRatioFromCornerDrag|IMAGE_PRESET_BUTTONS/,
  'enhanced image block plugin should centralize fitted sizing, proportional dragging, and preset controls'
);

assert.match(
  enhancedImageBlock,
  /toggleCaption\(\)\s*\{[\s\S]*updateCaptionVisibility\(\)[\s\S]*\}/,
  'caption toggle should update the existing DOM in place instead of recreating the image block'
);

assert.doesNotMatch(
  enhancedImageBlock,
  /toggleCaption\(\)\s*\{[\s\S]*this\.render\(\)[\s\S]*\}/,
  'caption toggle should not trigger a full image re-render that causes flicker and blur'
);

assert.match(
  enhancedImageBlock,
  /bindAttrs\(node\)\s*\{[\s\S]*updateFilledImageState\(\)[\s\S]*\}/,
  'image updates should patch the filled state in place when the source already exists'
);

assert.match(
  enhancedImageBlock,
  /createButton\(\{[\s\S]*className:\s*'confirm'[\s\S]*title:\s*'插入图片链接'[\s\S]*\}\)/,
  'empty-state confirm action should be rendered as a real button with an accessible title'
);

assert.doesNotMatch(
  buildScript,
  /replace\(|Patch 1|Patch 2|Patch 3/,
  'milkdown bundle build should no longer patch generated output strings'
);

assert.match(
  componentsCss,
  /\.image-edit[\s\S]*grid-template-columns:\s*24px minmax\(0,\s*1fr\) auto;[\s\S]*padding:\s*10px 12px;/,
  'empty image insert shell should use a compact three-column layout'
);

assert.match(
  componentsCss,
  /\.confirm[\s\S]*min-width:\s*32px[\s\S]*padding:\s*0;/,
  'confirm action should render as a compact inline control instead of an oversized broken block'
);

assert.match(
  componentsCss,
  /\.confirm svg[\s\S]*width:\s*16px[\s\S]*stroke:\s*currentColor;/,
  'confirm action should render a compact check icon instead of oversized text'
);

console.log('ok - image block upload, fit sizing, and modern proportional resize hooks are present');
