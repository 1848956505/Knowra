import assert from 'node:assert/strict';
import {
  findCodeBlockDepth,
  findCodeBlockPosition
} from '../lib/editor/milkdown/plugins/code-block-input-plugin.js';

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

const coordinateView = {
  posAtCoords() {
    return { pos: 8 };
  },
  posAtDOM() {
    return 4;
  },
  state: {
    doc: {
      resolve() {
        return createResolvedPosition(['doc', 'code_block']);
      }
    }
  }
};

assert.equal(
  findCodeBlockPosition(coordinateView, { clientX: 12, clientY: 24 }, {}),
  8,
  'a coordinate inside the code block should be preferred for cursor placement'
);

const domFallbackView = {
  posAtCoords() {
    return { pos: 2 };
  },
  posAtDOM() {
    return 4;
  },
  state: {
    doc: {
      resolve(position) {
        return position === 4
          ? createResolvedPosition(['doc', 'code_block'])
          : createResolvedPosition(['doc', 'paragraph']);
      }
    }
  }
};

assert.equal(
  findCodeBlockPosition(domFallbackView, { clientX: 12, clientY: 24 }, {}),
  4,
  'the code element DOM position should recover when coordinates miss the code text'
);

console.log('ok - code block click recovery detects editable code selections');
