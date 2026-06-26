import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderKnowledgePointPanel } from '../lib/knowledge-points/panel.js';

const html = renderKnowledgePointPanel({
  note: { id: 'note-v204', title: 'V2.0.4 Note' },
  points: [
    {
      id: 'kp-v204',
      title: '定位测试',
      comment: '',
      tagIds: [],
      sources: [
        {
          id: 'src-v204',
          knowledgePointId: 'kp-v204',
          noteId: 'note-v204',
          sourceText: '点击原文片段应回到正文选区',
          anchor: { type: 'prosemirror-text-range', from: 8, to: 21 },
          startOffset: 8,
          endOffset: 21
        }
      ]
    }
  ],
  expandedIds: { 'kp-v204': true }
});

assert.match(html, /data-knowledge-point-source-jump="src-v204"/);
assert.match(html, /data-knowledge-point-id="kp-v204"/);
assert.match(html, /点击原文片段应回到正文选区/);

const clientJs = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
const asideClickEventsJs = readFileSync(new URL('../lib/events/aside-events/click.js', import.meta.url), 'utf8');
const editorContentEventsJs = readFileSync(new URL('../lib/events/editor-content-events.js', import.meta.url), 'utf8');
assert.match(clientJs, /syncKnowledgePointMarkers/);
assert.match(clientJs, /setKnowledgePointSources/);
assert.match(clientJs, /selectKnowledgePointSource/);
assert.match(asideClickEventsJs, /data-knowledge-point-source-jump/);
assert.match(editorContentEventsJs, /knowledge-point-marker-click/);
assert.match(clientJs, /scrollKnowledgePointCardIntoView/);

const milkdownEntry = readFileSync(new URL('../lib/editor/milkdown-entry.js', import.meta.url), 'utf8');
assert.match(milkdownEntry, /knowledgePointHighlightPluginKey/);
assert.match(milkdownEntry, /setKnowledgePointSources/);
assert.match(milkdownEntry, /selectKnowledgePointSource/);
assert.match(milkdownEntry, /data-knowledge-point-source-id/);

console.log('ok - V2.0.4 knowledge point source positioning hooks are wired');
