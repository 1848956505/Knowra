import { NodeSelection, Plugin } from '@milkdown/kit/prose/state';
import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorProps, EditorView } from '@milkdown/kit/prose/view';
import { imageAttr, imageSchema } from '@milkdown/kit/preset/commonmark';
import { $prose } from '@milkdown/kit/utils';
import { fittedImageSize, imageRatioAttrs, readImageSize } from './editorImageModel';

export const IMAGE_CONTEXT_EVENT = 'knowra-image-context';

const selectImage: NonNullable<EditorProps['handleClickOn']> = (view, _pos, node, nodePos, _event, direct) => {
  if (!direct || node.type.name !== 'image' || !view.editable) return false;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
  view.focus();
  return true;
};

export function imageHtmlWithRenderedSizes(html: string, view: Pick<EditorView, 'dom'>): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const rendered = Array.from(view.dom.querySelectorAll<HTMLImageElement>('img[data-editor-image]'));
  parsed.body.querySelectorAll<HTMLImageElement>('img').forEach((image, index) => {
    const source = rendered[index];
    // 同一附件可以多次插入并分别缩放；按文档顺序复用实际宽度而不是仅按 URL 去重。
    if (source?.getAttribute('src') === image.getAttribute('src') && source.getBoundingClientRect().width > 0) {
      image.style.width = `${source.getBoundingClientRect().width}px`;
    }
  });
  return Array.from(parsed.body.childNodes).map(node => new XMLSerializer().serializeToString(node)).join('');
}

/** HTML 导出与富文本复制保留尺寸，title 不暴露内部比例标记。 */
export function configureImageSize(ctx: Ctx) {
  ctx.update(imageSchema.key, original => schemaCtx => ({
    ...original(schemaCtx),
    parseDOM: [{ tag: 'img[src]', getAttrs: dom => {
      if (!(dom instanceof HTMLElement)) return false;
      const attrs = { src: dom.getAttribute('src') ?? '', alt: dom.getAttribute('alt') ?? '', title: dom.getAttribute('title') ?? '' };
      const ratio = dom.getAttribute('data-knowra-image-ratio');
      return ratio === null ? attrs : imageRatioAttrs(attrs, Number(ratio));
    } }],
    toDOM: node => {
      const size = readImageSize(node.attrs);
      return ['img', { ...schemaCtx.get(imageAttr.key)(node), ...node.attrs,
        title: size.title, 'data-knowra-image-ratio': size.ratio,
        style: `width:${size.ratio * 100}%;max-width:100%;height:auto` }];
    }
  }));
}

export const editorImageBehavior = $prose(() => new Plugin({
  props: {
    handleClickOn: selectImage,
    handleDoubleClickOn: selectImage,
    handleTripleClickOn: selectImage,
    nodeViews: {
      image(initial, view) {
        let node = initial;
        const image = document.createElement('img');
        image.dataset.editorImage = 'true';
        const notify = () => view.dom.dispatchEvent(new Event(IMAGE_CONTEXT_EVENT, { bubbles: true }));
        const resize = () => {
          if (image.dataset.resizePreview === 'true') return;
          if (!image.naturalWidth) return;
          const size = fittedImageSize(image.naturalWidth, image.parentElement?.clientWidth || view.dom.clientWidth, readImageSize(node.attrs).ratio);
          image.style.width = `${size.width}px`;
          image.style.height = 'auto';
          notify();
        };
        const sync = () => {
          if (image.getAttribute('src') !== node.attrs.src) image.src = node.attrs.src;
          image.alt = node.attrs.alt ?? '';
          image.title = readImageSize(node.attrs).title;
          resize();
        };
        image.addEventListener('load', resize);
        const observer = new ResizeObserver(resize);
        observer.observe(view.dom);
        sync();
        return {
          dom: image,
          update(next) { if (next.type !== node.type) return false; node = next; sync(); return true; },
          ignoreMutation: mutation => mutation.type !== 'selection',
          destroy() { observer.disconnect(); image.removeEventListener('load', resize); }
        };
      }
    }
  },
  view: () => ({ update(view, previous) {
    if (!view.state.doc.eq(previous.doc) || !view.state.selection.eq(previous.selection)) {
      view.dom.dispatchEvent(new Event(IMAGE_CONTEXT_EVENT, { bubbles: true }));
    }
  } })
}));
