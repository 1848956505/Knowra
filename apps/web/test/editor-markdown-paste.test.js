import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const editorCommandsControllerJs = fs.readFileSync(path.resolve(__dirname, '../src/controllers/editor/commands-controller.js'), 'utf8');
const milkdownEntry = fs.readFileSync(path.resolve(__dirname, '../lib/editor/milkdown-entry.js'), 'utf8');

assert.match(
  milkdownEntry,
  /import\s*\{[^}]*clipboard[^}]*\}\s*from '@milkdown\/plugin-clipboard';/,
  'milkdown editor should enable the official clipboard plugin so plain-text paste can be parsed as Markdown'
);
assert.match(
  milkdownEntry,
  /\.use\(clipboard\)/,
  'milkdown editor should register clipboard handling in the editor pipeline'
);
assert.match(
  milkdownEntry,
  /\.use\(markdownPasteBehavior\)\s*\.use\(clipboard\)/,
  'plain-text Markdown paste should be handled before the official clipboard DOM round-trip'
);
assert.match(
  milkdownEntry,
  /handlePaste[\s\S]*parseMarkdownSlice\(ctx, text\)/,
  'native paste should use the direct Markdown fragment parser instead of the clipboard DOM round-trip'
);
assert.match(
  milkdownEntry,
  /shouldPreferPlainMarkdown\(\{\s*text,\s*vscodeData\s*\}\)/,
  'plain-text Markdown parsing should preserve the official VS Code clipboard behavior'
);
assert.match(
  milkdownEntry,
  /handlePaste\(view, event, preProcessedSlice\)[\s\S]*removeSpuriousEmptyCodeBlocks\(preProcessedSlice\)/,
  'rich HTML paste should clean the already parsed ProseMirror slice without falling back to raw Markdown text'
);
assert.match(
  milkdownEntry,
  /cleanedSlice !== preProcessedSlice[\s\S]*replaceSelection\(cleanedSlice\)/,
  'the editor should take over HTML paste only when a spurious empty code block was actually removed'
);
assert.match(
  milkdownEntry,
  /async pasteMarkdown\(markdown\)/,
  'editor host should expose a Markdown-aware paste helper for menu-driven paste actions'
);
assert.match(
  milkdownEntry,
  /new Slice\(content,\s*0,\s*0\)/,
  'markdown paste should trim empty paragraphs and use a closed slice to prevent spurious blank blocks'
);
assert.doesNotMatch(
  milkdownEntry,
  /markdownToSlice\(text\)/,
  'markdown paste should not use markdownToSlice because its DOM round-trip duplicates fenced code blocks'
);
assert.match(
  editorCommandsControllerJs,
  /editorRuntime\.currentEditorHost\?\.pasteMarkdown\(text\)/,
  'menu paste should delegate to the editor host so pasted Markdown is formatted instead of inserted as raw source'
);
console.log('ok - markdown paste is routed through Milkdown clipboard parsing');
