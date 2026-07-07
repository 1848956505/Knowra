import { escapeHtml } from '../../src/app/formatting.js';

const STROKE_ATTRS = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

const ICON_CONTENT = {
  cut: `
    <circle cx="8" cy="16" r="2.2" ${STROKE_ATTRS}></circle>
    <circle cx="16" cy="16" r="2.2" ${STROKE_ATTRS}></circle>
    <path d="M9.8 14.4 18 6.2" ${STROKE_ATTRS}></path>
    <path d="M14.2 14.4 6 6.2" ${STROKE_ATTRS}></path>
  `,
  copy: `
    <rect x="8" y="7" width="9" height="11" rx="2.2" ${STROKE_ATTRS}></rect>
    <path d="M6.5 15.5H6A2 2 0 0 1 4 13.5V6a2 2 0 0 1 2-2h7.5" ${STROKE_ATTRS}></path>
  `,
  paste: `
    <rect x="6.5" y="6.5" width="11" height="13" rx="2.2" ${STROKE_ATTRS}></rect>
    <path d="M9 6V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V6" ${STROKE_ATTRS}></path>
    <path d="M9 10h6M9 13h6M9 16h4.5" ${STROKE_ATTRS}></path>
  `,
  delete: `
    <path d="M6.5 7.5h11" ${STROKE_ATTRS}></path>
    <path d="M8.2 7.5V6A2 2 0 0 1 10.2 4h3.6a2 2 0 0 1 2 2v1.5" ${STROKE_ATTRS}></path>
    <path d="M8.5 7.5 9 18a2 2 0 0 0 2 1.9h2a2 2 0 0 0 2-1.9l.5-10.5" ${STROKE_ATTRS}></path>
  `,
  bold: `
    <path d="M8 5.5h4.5a3.2 3.2 0 1 1 0 6.4H8z" ${STROKE_ATTRS}></path>
    <path d="M8 11.9h5.3a3.4 3.4 0 1 1 0 6.8H8z" ${STROKE_ATTRS}></path>
  `,
  italic: `<path d="M13.8 5.5h-4.4M14.6 18.5h-4.4M12.3 5.5 9.7 18.5" ${STROKE_ATTRS}></path>`,
  highlight: `
    <path d="M5 17.5h6M9 16.2 16 9.2l2.8 2.8-7 7z" ${STROKE_ATTRS}></path>
    <path d="M13.5 6.5 16.5 9l1.5-1.5a1.6 1.6 0 0 0 0-2.3l-1.2-1.2a1.6 1.6 0 0 0-2.3 0z" ${STROKE_ATTRS}></path>
  `,
  code: `<path d="M9 8.4 5.6 12 9 15.6M15 8.4 18.4 12 15 15.6" ${STROKE_ATTRS}></path>`,
  codeblock: `<path d="M9.2 8.2 5.5 12l3.7 3.8M14.8 8.2 18.5 12l-3.7 3.8M12.9 7 11.1 17" ${STROKE_ATTRS}></path>`,
  quote: `
    <path d="M7.8 10.2h3.4v3.1a3.2 3.2 0 0 1-3.2 3.2H7v-2.1h.6a1.1 1.1 0 0 0 1.1-1.1v-.8H7.8z" ${STROKE_ATTRS}></path>
    <path d="M13.5 10.2h3.4v3.1a3.2 3.2 0 0 1-3.2 3.2h-1v-2.1h.6a1.1 1.1 0 0 0 1.1-1.1v-.8h-.9z" ${STROKE_ATTRS}></path>
  `,
  table: `
    <rect x="4.5" y="5.5" width="15" height="13" rx="1.8" ${STROKE_ATTRS}></rect>
    <path d="M9.5 5.8v12.4M14.5 5.8v12.4M4.8 10h14.4M4.8 14h14.4" ${STROKE_ATTRS}></path>
  `,
  ordered: `
    <path d="M9.5 7.5h8M9.5 12h8M9.5 16.5h8M5.8 8.2V6.4l-1 .7M4.8 12.2c.3-.7.8-1.1 1.5-1.1.8 0 1.5.6 1.5 1.4 0 .7-.4 1.1-1 1.5l-1.8 1.2h2.9" ${STROKE_ATTRS}></path>
  `,
  bullet: `
    <circle cx="6.2" cy="7.8" r="1.1" fill="currentColor"></circle>
    <circle cx="6.2" cy="12" r="1.1" fill="currentColor"></circle>
    <circle cx="6.2" cy="16.2" r="1.1" fill="currentColor"></circle>
    <path d="M9.5 7.8h8M9.5 12h8M9.5 16.2h8" ${STROKE_ATTRS}></path>
  `,
  'task-list': `<path d="M5.3 8.1 6.8 9.6l2.4-2.8M10.5 8h7M5.3 12.3 6.8 13.8l2.4-2.8M10.5 12.2h7M5.3 16.5 6.8 18l2.4-2.8M10.5 16.4h7" ${STROKE_ATTRS}></path>`,
  outdent: `<path d="M10.5 7.8h7M10.5 12h7M10.5 16.2h7M4.8 12h4.4M7 9.8 4.8 12 7 14.2" ${STROKE_ATTRS}></path>`,
  indent: `<path d="M6.5 7.8h7M6.5 12h7M6.5 16.2h7M14.8 12h4.4M17 9.8l2.2 2.2-2.2 2.2" ${STROKE_ATTRS}></path>`
};

export function renderEditorContextIconSvg(icon) {
  const content = ICON_CONTENT[icon] ?? `<text x="12" y="14" text-anchor="middle" font-size="9" font-weight="600" fill="currentColor">${escapeHtml(icon || '')}</text>`;
  return `
    <span class="editor-context-glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        ${content}
      </svg>
    </span>
  `;
}
