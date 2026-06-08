import assert from 'node:assert/strict';
import {
  resolveEnterBehavior,
  shouldKeepTrailingBlank
} from '../lib/editor/enter-behavior.js';

function runTest(name, callback) {
  try {
    callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

runTest('shouldKeepTrailingBlank adds a trailing paragraph only at the non-empty document end', () => {
  assert.equal(
    shouldKeepTrailingBlank({
      docIsEmpty: false,
      atDocEnd: true,
      currentBlockIsBlank: false,
      trailingBlankCount: 0
    }),
    true
  );

  assert.equal(
    shouldKeepTrailingBlank({
      docIsEmpty: false,
      atDocEnd: true,
      currentBlockIsBlank: true,
      trailingBlankCount: 1
    }),
    false
  );

  assert.equal(
    shouldKeepTrailingBlank({
      docIsEmpty: false,
      atDocEnd: false,
      currentBlockIsBlank: false,
      trailingBlankCount: 0
    }),
    false
  );
});

runTest('resolveEnterBehavior exits empty structured blocks', () => {
  assert.equal(
    resolveEnterBehavior({
      parentType: 'list_item',
      parentIsBlank: true,
      previousSiblingType: null
    }),
    'exit-structured-block'
  );

  assert.equal(
    resolveEnterBehavior({
      parentType: 'blockquote',
      parentIsBlank: true,
      previousSiblingType: null
    }),
    'exit-structured-block'
  );
});

runTest('resolveEnterBehavior keeps continuing non-empty structured blocks', () => {
  assert.equal(
    resolveEnterBehavior({
      parentType: 'list_item',
      parentIsBlank: false,
      previousSiblingType: null
    }),
    'continue-structured-block'
  );

  assert.equal(
    resolveEnterBehavior({
      parentType: 'code_block',
      parentIsBlank: false,
      previousSiblingType: null
    }),
    'continue-structured-block'
  );
});

runTest('resolveEnterBehavior stays normal in ordinary paragraphs', () => {
  assert.equal(
    resolveEnterBehavior({
      parentType: 'paragraph',
      parentIsBlank: false,
      previousSiblingType: 'paragraph'
    }),
    'default'
  );
});
