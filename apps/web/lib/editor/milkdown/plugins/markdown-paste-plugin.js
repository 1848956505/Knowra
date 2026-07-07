import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';
import {
  removeSpuriousEmptyCodeBlocks,
  shouldPreferPlainMarkdown,
  stripPastedInlineStyles
} from '../../markdown-paste.js';
import { parseMarkdownSlice } from '../utils/markdown-slice.js';

export function createMarkdownPasteBehavior(host) {
  return $prose((ctx) => new Plugin({
    key: new PluginKey('STUDY_MARKDOWN_PASTE_BEHAVIOR'),
    props: {
      transformPastedHTML(html) {
        // Strip inline `style` attributes from any pasted HTML so ChatGPT /
        // Claude's purple-blue keyword annotations don't leak into the user's
        // notes. See `stripPastedInlineStyles` for details.
        return stripPastedInlineStyles(html);
      },
      handlePaste(view, event, preProcessedSlice) {
        const clipboardData = event.clipboardData;
        if (!clipboardData || view.state.selection.$from.parent.type.spec.code) {
          return false;
        }

        const imageFiles = Array.from(clipboardData.items ?? [])
          .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
          .filter((file) => file instanceof File && file.type.startsWith('image/'));

        if (imageFiles.length > 0) {
          event.preventDefault();
          imageFiles.forEach((file) => {
            host.pasteImageFile(file);
          });
          return true;
        }

        const html = clipboardData.getData('text/html');
        if (html) {
          const cleanedSlice = removeSpuriousEmptyCodeBlocks(preProcessedSlice);
          if (cleanedSlice !== preProcessedSlice) {
            event.preventDefault();
            view.dispatch(view.state.tr.replaceSelection(cleanedSlice).scrollIntoView());
            return true;
          }
          return false;
        }

        const text = clipboardData.getData('text/plain');
        const vscodeData = clipboardData.getData('vscode-editor-data');
        if (!shouldPreferPlainMarkdown({ text, vscodeData })) {
          return false;
        }

        const slice = parseMarkdownSlice(ctx, text);
        if (!slice) {
          return false;
        }

        event.preventDefault();
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        return true;
      }
    }
  }));
}
