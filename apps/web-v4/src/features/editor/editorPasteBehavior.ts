import { Fragment, Slice } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { parserCtx } from '@milkdown/kit/core';
import { parseMarkdownSlice } from './editorMarkdownSlice';

const MARKDOWN_BLOCK_PATTERNS = [
  /^\s{0,3}#{1,6}\s+/m,
  /^\s{0,3}(?:```|~~~)/m,
  /^\s{0,3}>\s+/m,
  /^\s{0,3}(?:[-*+] |\d+\. )/m,
  /^\s{0,3}\|.+\|\s*$/m
];

export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_BLOCK_PATTERNS.some((pattern) => pattern.test(text));
}

export function shouldPreferPlainMarkdown(input: {
  text: string;
  html: string;
  vscodeData: string;
}): boolean {
  return Boolean(input.text)
    && !input.vscodeData
    && (!input.html || looksLikeMarkdown(input.text));
}

export function stripPastedInlineStyles(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html;
  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const element of document.body.querySelectorAll('[style]')) element.removeAttribute('style');
  return Array.from(document.body.childNodes).map(serializeHtmlNode).join('');
}

export function removeSpuriousEmptyCodeBlocks(slice: Slice): Slice {
  const content = sanitizeFragment(slice.content);
  return content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd);
}

export function findUnsupportedPasteSources(html: string, text: string): string[] {
  const sources = new Set<string>();
  for (const source of [html, text]) {
    for (const match of source.matchAll(/(?:src\s*=\s*["']?|!\[[^\]]*\]\(\s*)(http:\/\/[^\s"')>]+)/gi)) {
      if (match[1]) sources.add(match[1]);
    }
  }
  return [...sources];
}

export interface UploadedEditorImage {
  url: string;
  alt: string;
}

export function createEditorPasteBehavior(
  onStatus: (message: string) => void,
  onUploadImage?: (file: File) => Promise<UploadedEditorImage>
) {
  return $prose((ctx) => new Plugin({
    key: new PluginKey('V4_EDITOR_PASTE_BEHAVIOR'),
    props: {
      transformPastedHTML: stripPastedInlineStyles,
      handlePaste(view, event, preProcessedSlice) {
        const clipboardData = event.clipboardData;
        if (!clipboardData || view.state.selection.$from.parent.type.spec.code) return false;

        const imageFiles = Array.from(clipboardData.items ?? []).filter((item) => (
          item.kind === 'file' && item.type.startsWith('image/')
        ));
        if (imageFiles.length > 0) {
          event.preventDefault();
          if (!onUploadImage) {
            onStatus('当前无法上传图片');
            return true;
          }
          const files = imageFiles
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));
          onStatus(files.length > 1 ? `正在上传 ${files.length} 张图片…` : '正在上传图片…');
          void uploadPastedImages(view, files, onUploadImage, onStatus);
          return true;
        }

        const html = clipboardData.getData('text/html');
        const text = clipboardData.getData('text/plain');
        const unsupportedSources = findUnsupportedPasteSources(html, text);
        if (unsupportedSources.length > 0) {
          event.preventDefault();
          onStatus('已阻止不安全的 HTTP 图片链接，请改用 HTTPS 或本地附件');
          return true;
        }

        if (shouldPreferPlainMarkdown({
          text,
          html,
          vscodeData: clipboardData.getData('vscode-editor-data')
        })) {
          const slice = parseMarkdownSlice(ctx.get(parserCtx), text);
          if (!slice) return false;
          event.preventDefault();
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        }

        if (!html) return false;
        const cleanedSlice = removeSpuriousEmptyCodeBlocks(preProcessedSlice);
        if (cleanedSlice === preProcessedSlice) return false;
        event.preventDefault();
        view.dispatch(view.state.tr.replaceSelection(cleanedSlice).scrollIntoView());
        return true;
      }
    }
  }));
}

async function uploadPastedImages(
  view: EditorView,
  files: File[],
  onUploadImage: (file: File) => Promise<UploadedEditorImage>,
  onStatus: (message: string) => void
): Promise<void> {
  try {
    for (const file of files) {
      const uploaded = await onUploadImage(file);
      const imageType = view.state.schema.nodes.image;
      if (!imageType) throw new Error('编辑器未启用图片节点');
      const image = imageType.create({ src: uploaded.url, alt: uploaded.alt, title: null });
      view.dispatch(view.state.tr.replaceSelectionWith(image).scrollIntoView());
    }
    onStatus(files.length > 1 ? `已插入 ${files.length} 张图片` : '图片已插入正文');
  } catch (error) {
    onStatus(error instanceof Error ? error.message : '图片上传失败');
  }
}

function sanitizeFragment(fragment: Fragment): Fragment {
  const children = [];
  let changed = false;
  for (let index = 0; index < fragment.childCount; index += 1) {
    const node = fragment.child(index);
    const nextNode = index + 1 < fragment.childCount ? fragment.child(index + 1) : null;
    if (
      node.type.name === 'code_block'
      && !node.textContent.trim()
      && nextNode?.type.name === 'code_block'
      && Boolean(nextNode.textContent.trim())
    ) {
      changed = true;
      continue;
    }
    const content = node.content.size > 0 ? sanitizeFragment(node.content) : node.content;
    children.push(content === node.content ? node : node.copy(content));
    if (content !== node.content) changed = true;
  }
  return changed ? Fragment.fromArray(children) : fragment;
}

function serializeHtmlNode(node: Node): string {
  if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).outerHTML;
  if (node.nodeType !== Node.TEXT_NODE) return '';
  return (node.textContent ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
