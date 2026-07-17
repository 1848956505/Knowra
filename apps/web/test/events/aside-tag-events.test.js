import assert from 'node:assert/strict';
import { bindAsideContentClickEvents } from '../../lib/events/aside-events/click.js';
import { bindAsideContentFormEvents } from '../../lib/events/aside-events/forms.js';
import { bindAsideContentInputEvents } from '../../lib/events/aside-events/input.js';
import { createRecorderElement } from '../_support/recorder-elements.js';

function makeTarget(selector, dataset = {}, value = '') {
  const target = { dataset, value };
  target.closest = (candidate) => candidate === selector ? target : null;
  return target;
}

{
  const asideContent = createRecorderElement();
  const state = { noteTagComposer: { draft: '', isExpanded: false } };
  let rendered = 0;
  bindAsideContentClickEvents({
    state,
    elements: { asideContent },
    deps: {
      getCurrentNote: () => ({ id: 'note-1' }),
      renderSidebar: () => { rendered += 1; }
    }
  });

  asideContent.dispatch('click', makeTarget('[data-note-tag-toggle]'));
  assert.equal(state.noteTagComposer.isExpanded, true);
  assert.equal(rendered, 1);
}

{
  const asideContent = createRecorderElement();
  let draft = '';
  bindAsideContentInputEvents({
    elements: { asideContent },
    deps: { updateNoteTagDraft: (value) => { draft = value; } }
  });

  asideContent.dispatch('input', makeTarget('[data-note-tag-input]', {}, '知识管理'));
  assert.equal(draft, '知识管理');
}

{
  const asideContent = createRecorderElement();
  const state = { noteTagComposer: { draft: '新标签', isExpanded: true } };
  let created = '';
  let prevented = false;
  bindAsideContentFormEvents({
    state,
    elements: { asideContent },
    deps: { createTagAndAssignToCurrentNote: async (value) => { created = value; } }
  });

  asideContent.dispatch('keydown', makeTarget('[data-note-tag-input]'), {
    key: 'Enter',
    isComposing: false,
    preventDefault: () => { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(created, '新标签');
}

console.log('ok - aside tag events expand, update and submit the tag composer');
