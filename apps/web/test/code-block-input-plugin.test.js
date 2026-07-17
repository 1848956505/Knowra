import assert from 'node:assert/strict';
import { findCodeBlockDepth } from '../lib/editor/milkdown/plugins/code-block-input-plugin.js';

function createResolvedPosition(types) {
  return {
    depth: types.length - 1,
    node(depth) {
      return { type: { name: types[depth] } };
    }
  };
}

assert.equal(
  findCodeBlockDepth(createResolvedPosition(['doc', 'code_block'])),
  1,
  'a direct code block selection should be detected'
);
assert.equal(
  findCodeBlockDepth(createResolvedPosition(['doc', 'blockquote', 'code_block'])),
  2,
  'a nested code block selection should be detected at its nearest depth'
);
assert.equal(
  findCodeBlockDepth(createResolvedPosition(['doc', 'paragraph'])),
  null,
  'ordinary text selections should not be treated as code blocks'
);

console.log('ok - code block click recovery detects editable code selections');
