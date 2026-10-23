import assert from 'node:assert/strict';
import test from 'node:test';
import { updateStructure } from '@study-accelerator/content-anchor';
import { Note } from '../src/modules/knowledge/domain/note.ts';
import { createNoteService } from '../src/modules/knowledge/application/note-service.js';

const epoch = '1970-01-01T00:00:00.000Z';
const timestamp = '2026-10-22T00:00:00.000Z';
const input = { id: 'history-note', title: 'History', rawMarkdown: 'body', createdAt: timestamp };

const defaults = {
  contentHash: null,
  status: 'draft',
  sourceType: 'manual',
  favorite: false,
  deleted: false,
  createdAt: timestamp,
  updatedAt: timestamp,
  folderDeletionPackageId: null,
  deletionPackage: null
};

for (const field of Object.keys(defaults)) {
  test(`Note history: ${field} preserves unvalidated values without coercion`, () => {
    const throwing = {
      [Symbol.toPrimitive]() {
        throw new Error('History fields must not be coerced');
      }
    };
    for (const value of [
      null,
      false,
      true,
      0,
      -1,
      NaN,
      Infinity,
      '',
      'irregular',
      [],
      {},
      Symbol(field),
      1n,
      throwing
    ]) {
      const note = new Note({ ...input, [field]: value });
      assert.equal(note[field], value);
      if (field === 'createdAt') assert.equal(note.updatedAt, value);
    }
    if (field !== 'createdAt') {
      assert.equal(new Note({ ...input, [field]: undefined })[field], defaults[field]);
    }
  });
}

test('Note history: omitted and undefined timestamps default in createdAt then updatedAt order', () => {
  for (const timestamps of [{}, { createdAt: undefined }, { createdAt: undefined, updatedAt: undefined }]) {
    const before = Date.now();
    const note = new Note({ id: input.id, title: input.title, rawMarkdown: input.rawMarkdown, ...timestamps });
    const after = Date.now();
    assert.equal(typeof note.createdAt, 'string');
    assert.equal(new Date(note.createdAt).toISOString(), note.createdAt);
    assert.ok(Date.parse(note.createdAt) >= before && Date.parse(note.createdAt) <= after);
    assert.equal(note.updatedAt, note.createdAt);
  }
  const createdAt = { historical: true };
  assert.equal(new Note({ ...input, createdAt, updatedAt: undefined }).updatedAt, createdAt);
  assert.equal(new Note({ ...input, createdAt, updatedAt: null }).updatedAt, null);
});

test('Note history: annotationStructure preserves falsy values and references, falling back only for nullish values', () => {
  for (const value of [0, false, '', NaN, [], {}, Symbol('structure'), 1n]) {
    assert.equal(new Note({ ...input, annotationStructure: value }).annotationStructure, value);
  }
  for (const value of [null, undefined]) {
    assert.deepEqual(
      new Note({ ...input, annotationStructure: value }).annotationStructure,
      updateStructure('', input.rawMarkdown)
    );
  }
});

// Deliberately bypass repository.save timestamp normalization: these tests exercise
// the real service's expectedUpdatedAt comparison against historical records.
function serviceFor(updatedAt) {
  const current = { ...new Note(input), updatedAt };
  const calls = [];
  const repository = {
    findById(id) {
      calls.push(['findById', id]);
      return current;
    },
    save(note) {
      calls.push(['save', note]);
      return note;
    }
  };
  return { service: createNoteService({ repository }), current, calls };
}

function accepts(updatedAt, expectedUpdatedAt) {
  const { service, calls } = serviceFor(updatedAt);
  const result = service.updateNote(input.id, { expectedUpdatedAt, updatedAt: timestamp });
  assert.equal(result.id, input.id);
  assert.equal(result.updatedAt, timestamp);
  assert.deepEqual(calls, [
    ['findById', input.id],
    ['save', result]
  ]);
}

for (const [name, value, expected] of [
  ['null', null, epoch],
  ['false', false, epoch],
  ['true', true, '1970-01-01T00:00:00.001Z'],
  ['zero', 0, epoch],
  ['negative number', -1, '1969-12-31T23:59:59.999Z'],
  ['fractional number', 1.9, '1970-01-01T00:00:00.001Z'],
  ['Date', new Date(timestamp), timestamp],
  ['ISO string', timestamp, timestamp]
]) {
  test(`updateNote history: Date comparison accepts ${name}`, () => accepts(value, expected));
}

for (const [name, value, ErrorClass] of [
  ['undefined', undefined, RangeError],
  ['NaN', NaN, RangeError],
  ['Infinity', Infinity, RangeError],
  ['invalid string', 'not-a-date', RangeError],
  ['invalid Date', new Date(NaN), RangeError],
  ['Symbol', Symbol('date'), TypeError],
  ['BigInt', 1n, TypeError]
]) {
  test(`updateNote history: ${name} retains native ${ErrorClass.name}`, () => {
    const { service, calls } = serviceFor(value);
    assert.throws(() => service.updateNote(input.id, { expectedUpdatedAt: epoch }), ErrorClass);
    assert.deepEqual(calls, [['findById', input.id]]);
  });
}

test('updateNote history: a valid but unequal date remains a conflict without saving', () => {
  const { service, calls } = serviceFor(null);
  assert.throws(() => service.updateNote(input.id, { expectedUpdatedAt: timestamp }), { code: 'NOTE_UPDATE_CONFLICT' });
  assert.deepEqual(calls, [['findById', input.id]]);
});

test('updateNote history: custom primitive conversion uses default hint exactly once', () => {
  const calls = [];
  const value = {
    get [Symbol.toPrimitive]() {
      calls.push('get toPrimitive');
      return function (hint) {
        assert.equal(this, value);
        calls.push(['toPrimitive', hint]);
        return timestamp;
      };
    },
    get valueOf() {
      throw new Error('Unexpected valueOf read');
    },
    get toString() {
      throw new Error('Unexpected toString read');
    }
  };
  accepts(value, timestamp);
  assert.deepEqual(calls, ['get toPrimitive', ['toPrimitive', 'default']]);
});

test('updateNote history: ordinary conversion reads valueOf before toString and stops at a primitive', () => {
  for (const valueOfResult of [0, {}]) {
    const calls = [];
    const value = {
      get [Symbol.toPrimitive]() {
        calls.push('get toPrimitive');
        return undefined;
      },
      get valueOf() {
        calls.push('get valueOf');
        return function () {
          assert.equal(this, value);
          calls.push('valueOf');
          return valueOfResult;
        };
      },
      get toString() {
        calls.push('get toString');
        return function () {
          assert.equal(this, value);
          calls.push('toString');
          return epoch;
        };
      }
    };
    accepts(value, epoch);
    assert.deepEqual(
      calls,
      typeof valueOfResult === 'number'
        ? ['get toPrimitive', 'get valueOf', 'valueOf']
        : ['get toPrimitive', 'get valueOf', 'valueOf', 'get toString', 'toString']
    );
  }
});

test('updateNote history: Date instances use their time value without invoking custom conversion', () => {
  const value = new Date(timestamp);
  for (const key of [Symbol.toPrimitive, 'valueOf', 'toString']) {
    Object.defineProperty(value, key, {
      get() {
        throw new Error('Date conversion hooks must not be read');
      }
    });
  }
  accepts(value, timestamp);
});

for (const converter of [Symbol.toPrimitive, 'valueOf', 'toString']) {
  test(`updateNote history: throwing ${String(converter)} preserves exact error identity`, () => {
    const error = new Error('conversion failure');
    const calls = [];
    const value = {
      [Symbol.toPrimitive]: undefined,
      valueOf() {
        calls.push('valueOf');
        return {};
      },
      toString() {
        calls.push('toString');
        return epoch;
      }
    };
    value[converter] = () => {
      calls.push(converter);
      throw error;
    };
    const fixture = serviceFor(value);
    assert.throws(
      () => fixture.service.updateNote(input.id, { expectedUpdatedAt: epoch }),
      caught => caught === error
    );
    assert.deepEqual(calls, converter === 'toString' ? ['valueOf', 'toString'] : [converter]);
    assert.deepEqual(fixture.calls, [['findById', input.id]]);
  });
}

test('updateNote history: absent expectedUpdatedAt skips conversion entirely', () => {
  const value = {
    [Symbol.toPrimitive]() {
      throw new Error('Comparison must not run');
    }
  };
  const { service, calls } = serviceFor(value);
  const result = service.updateNote(input.id, { updatedAt: timestamp });
  assert.equal(result.updatedAt, timestamp);
  assert.deepEqual(calls, [
    ['findById', input.id],
    ['save', result]
  ]);
});
