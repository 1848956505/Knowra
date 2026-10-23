import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const baseline = process.env.KNOWRA_METADATA_POLICY_BASELINE === '1';
const commit = '89792bb89cc24c6415c89d6bea41994d167c4c44';
const root = new URL('../src/infrastructure/', import.meta.url);
const names = ['attachment-status'];
const consumers = [
  'attachment-record-reconciliation',
  'attachment-integrity',
  'local-attachment-snapshot-validator',
  'local-data-schema',
  'local-attachment-upload',
  'local-attachment-store',
  'postgres-attachment-store',
  'migration/json-transformers'
];
let modules;
if (baseline) {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-metadata-policy-baseline-'));
  try {
    for (const name of [...names, ...consumers]) {
      const source = execFileSync('git', ['show', `${commit}:apps/api/src/infrastructure/${name}.js`], {
        cwd: new URL('../../../', import.meta.url),
        encoding: 'utf8'
      })
        .replace(/(['"])(\.\.?\/[^'"]+)\1/g, (_, quote, dependency) => {
          const url = new URL(dependency, new URL(`${name}.js`, root));
          const target = [...names, ...consumers].find(target => new URL(`${target}.js`, root).href === url.href);
          return JSON.stringify(
            target ? pathToFileURL(join(directory, `${target.replaceAll('/', '__')}.mjs`)).href : url.href
          );
        })
        .replace(/(['"])(@[^'"]+)\1/g, (_, quote, dependency) => JSON.stringify(import.meta.resolve(dependency)));
      writeFileSync(join(directory, `${name.replaceAll('/', '__')}.mjs`), source);
    }
    modules = await Promise.all(
      [...names, ...consumers].map(name => import(pathToFileURL(join(directory, `${name.replaceAll('/', '__')}.mjs`))))
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
} else modules = await Promise.all([...names, ...consumers].map(name => import(new URL(`${name}.js`, root))));
const [
  { ATTACHMENT_STATUS, ATTACHMENT_STATUS_VALUES, isAttachmentStatus, normalizeAttachmentStatus },
  { reconcileAttachmentIntegrity },
  { inspectAttachmentIntegrity, buildAttachmentRepairRecord },
  { validateAttachmentSnapshotItems },
  { createEmptyLocalState, validatePersistedLocalState },
  { createLocalAttachmentUpload },
  { createLocalAttachmentStore },
  { createPostgresAttachmentStore },
  { transformAttachment }
] = modules;
const statuses = ['pending', 'ready', 'missing', 'corrupt', 'failed'];
const reasons = [undefined, null, false, 0, -0, '', NaN, 1n, Symbol('failure'), {}];
function observe(operation) {
  try {
    return { threw: false, value: operation() };
  } catch (error) {
    return { threw: true, error };
  }
}
test(
  'attachment JS bridge exposes exactly the same runtime values and functions as TS',
  { skip: baseline },
  async () => {
    for (const [index, name] of names.entries()) {
      const implementation = await import(new URL(`${name}.ts`, root));
      const expected = [
        'ATTACHMENT_STATUS',
        'ATTACHMENT_STATUS_VALUES',
        'isAttachmentStatus',
        'normalizeAttachmentStatus'
      ];
      assert.deepEqual(Object.keys(modules[index]), expected);
      assert.deepEqual(Object.keys(implementation), expected);
      for (const key of expected) assert.equal(modules[index][key], implementation[key]);
    }
  }
);

test('attachment constants preserve exact keys, values, order, descriptors and frozen identities', () => {
  assert.deepEqual(Object.keys(ATTACHMENT_STATUS), ['PENDING', 'READY', 'MISSING', 'CORRUPT', 'FAILED']);
  assert.deepEqual(Object.values(ATTACHMENT_STATUS), statuses);
  assert.deepEqual(ATTACHMENT_STATUS_VALUES, statuses);
  assert.equal(Object.getPrototypeOf(ATTACHMENT_STATUS), Object.prototype);
  assert.equal(Object.getPrototypeOf(ATTACHMENT_STATUS_VALUES), Array.prototype);
  for (const value of [ATTACHMENT_STATUS, ATTACHMENT_STATUS_VALUES]) {
    assert.ok(Object.isFrozen(value));
    assert.ok(!Object.isExtensible(value));
    for (const key of Object.keys(value)) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(value, key), {
        value: value[key],
        enumerable: true,
        writable: false,
        configurable: false
      });
      assert.throws(() => {
        value[key] = 'changed';
      }, TypeError);
      assert.throws(() => {
        delete value[key];
      }, TypeError);
    }
    assert.throws(() => {
      value.extra = true;
    }, TypeError);
  }
  assert.throws(() => ATTACHMENT_STATUS_VALUES.push('new'), TypeError);
  assert.equal(isAttachmentStatus.length, 1);
  assert.equal(normalizeAttachmentStatus.length, 1);
});

test('membership is exact and never coerces arbitrary values, boxed strings or proxies', () => {
  const poison = new Proxy(
    {},
    {
      get() {
        throw new Error('must not read input');
      }
    }
  );
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const value of [
    undefined,
    null,
    false,
    true,
    0,
    -0,
    NaN,
    Infinity,
    1n,
    Symbol('ready'),
    {},
    [],
    () => {},
    poison,
    revoked.proxy,
    ...statuses.flatMap(status => [new String(status), status.toUpperCase(), ` ${status}`, `${status} `, `${status}\n`])
  ]) {
    assert.equal(isAttachmentStatus(value), false);
    assert.equal(normalizeAttachmentStatus(value), 'ready');
  }
  for (const status of statuses) {
    assert.equal(isAttachmentStatus(status), true);
    assert.equal(normalizeAttachmentStatus(status), status);
  }
});

test('normalization preserves all fallback types and reference identity, with undefined default semantics', () => {
  const proxy = new Proxy(
    {},
    {
      get() {
        throw new Error('fallback must remain opaque');
      }
    }
  );
  const fallbacks = [...reasons, true, Infinity, [], () => {}, proxy, ...statuses, 'unknown'];
  for (const fallback of fallbacks) {
    const expected = fallback === undefined ? 'ready' : fallback;
    for (const invalid of [undefined, null, 'READY', 'unknown', {}, Symbol('value')])
      assert.ok(Object.is(normalizeAttachmentStatus(invalid, fallback), expected));
    for (const value of statuses) assert.equal(normalizeAttachmentStatus(value, fallback), value);
  }
  assert.equal(normalizeAttachmentStatus(), 'ready');
  assert.equal(normalizeAttachmentStatus(undefined), 'ready');
  assert.equal(normalizeAttachmentStatus(undefined, undefined), 'ready');
  assert.equal(normalizeAttachmentStatus(undefined, null), null);
  assert.equal(normalizeAttachmentStatus.call(proxy, 'ready', proxy), 'ready');
});

test('includes lookup remains live with original receiver, argument and truthiness behavior', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'includes');
  const sentinel = {};
  const fallback = {};
  for (const answer of [false, true, undefined, null, 0, '', {}, 'yes']) {
    const calls = [];
    let membership;
    let normalized;
    try {
      Object.defineProperty(Array.prototype, 'includes', {
        configurable: true,
        get() {
          calls.push(['get', this]);
          return function (...args) {
            calls.push(['call', this, args]);
            return answer;
          };
        }
      });
      membership = isAttachmentStatus(sentinel);
      normalized = normalizeAttachmentStatus(sentinel, fallback);
    } finally {
      Object.defineProperty(Array.prototype, 'includes', descriptor);
    }
    assert.equal(membership, answer);
    assert.equal(normalized, answer ? sentinel : fallback);
    assert.equal(calls.length, 4);
    assert.deepEqual(
      calls.map(call => call[0]),
      ['get', 'call', 'get', 'call']
    );
    for (const call of calls) assert.equal(call[1], ATTACHMENT_STATUS_VALUES);
    assert.deepEqual(calls[1][2], [sentinel]);
    assert.deepEqual(calls[3][2], [sentinel]);
  }
});

test('includes getter/call failures preserve arbitrary thrown identity without returning fallback', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'includes');
  for (const reason of reasons)
    for (const stage of ['get', 'call']) {
      let result;
      try {
        Object.defineProperty(Array.prototype, 'includes', {
          configurable: true,
          get() {
            if (stage === 'get') throw reason;
            return () => {
              throw reason;
            };
          }
        });
        result = observe(() => normalizeAttachmentStatus('ready', {}));
      } finally {
        Object.defineProperty(Array.prototype, 'includes', descriptor);
      }
      assert.equal(result.threw, true);
      assert.ok(Object.is(result.error, reason));
    }
});

test('local schema consumer accepts every status and rejects invalid status before persistence', () => {
  function document(status) {
    return {
      schemaVersion: 7,
      ...createEmptyLocalState(),
      spaces: [{ id: 's', userId: 'u', name: 'space' }],
      notes: [{ id: 'n', spaceId: 's', title: 'note', rawMarkdown: '' }],
      attachments: [{ id: 'a', noteId: 'n', fileName: 'a.txt', status }]
    };
  }
  for (const status of [...statuses, undefined]) {
    const result = validatePersistedLocalState(document(status));
    assert.equal(result.attachments[0].status, status);
  }
  for (const status of [null, false, 0, {}, [], new String('ready'), 'READY', ' ready', Symbol('ready')])
    assert.throws(() => validatePersistedLocalState(document(status)), { message: 'attachments[0].status is invalid' });
});

test('attachment reconciliation and integrity consumers retain ready/missing/corrupt and repair semantics', () => {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-metadata-policy-files-'));
  try {
    const file = join(directory, 'a.txt');
    const bytes = Buffer.from('batch37');
    writeFileSync(file, bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const now = '2026-10-23T00:00:00.000Z';
    const manager = {
      getAttachmentFileName: () => 'a.txt',
      getAttachmentCandidatePaths: () => [file],
      getManagedUploadsDirectory: () => directory
    };
    for (const status of [...statuses, 'invalid', undefined, null]) {
      const attachment = {
        id: 'a',
        noteId: 'n',
        fileName: 'a.txt',
        storagePath: 'a.txt',
        size: bytes.length,
        sha256,
        status,
        verifiedAt: now
      };
      const report = inspectAttachmentIntegrity({ attachments: [attachment], fileManager: manager, generatedAt: now });
      assert.equal(report.items[0].storedStatus, statuses.includes(status) ? status : 'ready');
      assert.equal(report.items[0].observedStatus, 'ready');
      assert.equal(report.canServe, true);
      assert.equal(
        report.items[0].warnings.some(warning => warning.code === 'ATTACHMENT_STATUS_REPAIRED'),
        statuses.includes(status) && status !== 'ready'
      );
      const repaired = buildAttachmentRepairRecord(attachment, report.items[0], { verifiedAt: now });
      assert.notEqual(repaired, attachment);
      assert.equal(repaired.status, 'ready');
      assert.equal(attachment.status, status);
      reconcileAttachmentIntegrity(attachment, file, { now });
      assert.equal(attachment.status, 'ready');
      assert.equal(attachment.sha256, sha256);
      assert.equal(reconcileAttachmentIntegrity(attachment, file, { now }), false);
      assert.equal(reconcileAttachmentIntegrity(attachment, null, { now }), true);
      assert.equal(attachment.status, 'missing');
      assert.equal(attachment.verifiedAt, null);
      attachment.sha256 = '0'.repeat(64);
      assert.equal(reconcileAttachmentIntegrity(attachment, file, { now }), true);
      assert.equal(attachment.status, 'corrupt');
      const corrupt = inspectAttachmentIntegrity({ attachments: [attachment], fileManager: manager, generatedAt: now });
      assert.equal(corrupt.items[0].observedStatus, 'corrupt');
      assert.equal(corrupt.canServe, false);
      assert.equal(buildAttachmentRepairRecord(attachment, corrupt.items[0]).verifiedAt, null);
    }
    manager.getAttachmentCandidatePaths = () => [join(directory, 'missing')];
    const missing = inspectAttachmentIntegrity({ attachments: [{ id: 'a' }], fileManager: manager, generatedAt: now });
    assert.equal(missing.items[0].observedStatus, 'missing');
    assert.equal(missing.canServe, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('snapshot consumer uses verified READY rather than untrusted payload status and leaves input untouched', () => {
  const content = Buffer.from('payload');
  const sha256 = createHash('sha256').update(content).digest('hex');
  const timestamp = '2026-10-23T00:00:00.000Z';
  for (const status of [...statuses, 'unknown', undefined, null]) {
    const item = {
      id: 'a',
      noteId: 'n',
      fileName: 'a.txt',
      contentBase64: content.toString('base64'),
      sha256,
      status,
      createdAt: timestamp,
      verifiedAt: timestamp
    };
    const prepared = validateAttachmentSnapshotItems(
      [item],
      { buildStoragePath: (id, fileName) => `${id}/${fileName}` },
      { noteIds: new Set(['n']) }
    );
    assert.equal(prepared[0].status, 'ready');
    assert.equal(prepared[0].storagePath, 'a/a.txt');
    assert.deepEqual(prepared[0].content, content);
    assert.equal(item.status, status);
  }
});

test('local upload consumer persists PENDING before bytes and READY afterward including refreshed records', () => {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-status-upload-'));
  try {
    const file = join(directory, 'uploaded.txt');
    const state = { attachments: [] };
    const snapshots = [];
    const upload = createLocalAttachmentUpload({
      dataStore: { state },
      fileManager: { buildStoragePath: () => 'uploaded.txt', resolveManagedAbsolutePath: () => file },
      flush() {
        snapshots.push({ ...state.attachments[0] });
        state.attachments = state.attachments.map(item => ({ ...item }));
      }
    });
    const result = upload({
      noteId: 'n',
      fileName: 'uploaded.txt',
      contentBase64: Buffer.from('data').toString('base64')
    });
    assert.deepEqual(
      snapshots.map(item => item.status),
      ['pending', 'ready']
    );
    assert.equal(snapshots[0].verifiedAt, null);
    assert.equal(typeof snapshots[1].verifiedAt, 'string');
    assert.equal(result.status, 'ready');
    assert.equal(state.attachments[0].status, 'ready');
    assert.equal(readFileSync(file, 'utf8'), 'data');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('local upload preserves rollback/status persistence error identity and FAILED/PENDING transitions', () => {
  for (const mode of ['initial', 'file', 'ready', 'ready and rollback']) {
    const directory = mkdtempSync(join(tmpdir(), 'knowra-status-upload-fault-'));
    try {
      const state = { attachments: [] };
      const statuses = [];
      const failure = new Error(mode);
      const rollbackFailure = new Error('rollback');
      const upload = createLocalAttachmentUpload({
        dataStore: { state },
        fileManager: {
          buildStoragePath: () => 'uploaded.txt',
          resolveManagedAbsolutePath: () => (mode === 'file' ? directory : join(directory, 'uploaded.txt'))
        },
        flush() {
          statuses.push(state.attachments[0].status);
          if (mode === 'initial' || (mode.startsWith('ready') && statuses.length === 2)) throw failure;
          if (mode === 'ready and rollback' && statuses.length === 3) throw rollbackFailure;
        }
      });
      const result = observe(() => upload({ noteId: 'n', fileName: 'uploaded.txt', contentBase64: 'ZGF0YQ==' }));
      assert.equal(result.threw, true);
      if (mode !== 'file') assert.equal(result.error, failure);
      if (mode === 'initial') {
        assert.deepEqual(statuses, ['pending']);
        assert.deepEqual(state.attachments, []);
      } else {
        assert.deepEqual(statuses, mode === 'file' ? ['pending', 'failed'] : ['pending', 'ready', 'pending']);
        assert.equal(state.attachments[0].status, mode === 'file' ? 'failed' : 'pending');
        assert.equal(state.attachments[0].verifiedAt, null);
      }
      if (mode === 'ready and rollback') assert.equal(failure.statusPersistError, rollbackFailure);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test('local store consumes READY fallback when rename rollback restores legacy missing status', () => {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-status-store-'));
  try {
    const state = { attachments: [] };
    let fail = false;
    const failure = {};
    const store = createLocalAttachmentStore({
      dataStore: {
        state,
        flush() {
          if (fail) throw failure;
        }
      },
      uploadsDir: join(directory, 'uploads'),
      storageRootDir: directory
    });
    const attachment = store.uploadAttachment({ noteId: 'n', fileName: 'old.txt', contentBase64: 'ZGF0YQ==' });
    assert.equal(attachment.status, 'ready');
    assert.equal(store.readAttachmentContent(attachment.id).content.toString(), 'data');
    delete attachment.status;
    fail = true;
    const result = observe(() => store.renameAttachment(attachment.id, 'new.txt'));
    assert.equal(result.threw, true);
    assert.equal(result.error, failure);
    assert.equal(attachment.status, 'ready');
    assert.equal(attachment.fileName, 'old.txt');
    fail = false;
    assert.equal(store.readAttachmentContent(attachment.id).content.toString(), 'data');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('PostgreSQL store consumer preserves PENDING/READY and failed ready-save recovery without a database', async () => {
  for (const mode of ['success', 'ready failure', 'ready and rollback failure', 'file failure']) {
    const directory = mkdtempSync(join(tmpdir(), 'knowra-status-postgres-'));
    try {
      const statuses = [];
      const failure = new Error('ready save');
      const rollbackFailure = new Error('rollback save');
      let current = null;
      const repository = {
        async save(item) {
          statuses.push(item.status);
          if (mode.startsWith('ready') && statuses.length === 2) throw failure;
          if (mode === 'ready and rollback failure' && statuses.length === 3) throw rollbackFailure;
          current = { ...item };
          return current;
        },
        async findById() {
          return current;
        }
      };
      const uploadsDir = join(directory, 'uploads');
      const store = createPostgresAttachmentStore({
        attachmentRepository: repository,
        uploadsDir,
        storageRootDir: directory
      });
      if (mode === 'file failure') {
        rmSync(uploadsDir, { recursive: true, force: true });
        writeFileSync(uploadsDir, 'not a directory');
      }
      const result = await store.uploadAttachment({ noteId: 'n', fileName: 'a.txt', contentBase64: 'ZGF0YQ==' }).then(
        value => ({ value }),
        error => ({ error, failed: true })
      );
      if (mode === 'success') {
        assert.deepEqual(statuses, ['pending', 'ready']);
        assert.equal(result.value.status, 'ready');
        assert.equal((await store.readAttachmentContent(result.value.id)).content.toString(), 'data');
      } else {
        assert.equal(result.failed, true);
        if (mode.startsWith('ready')) assert.equal(result.error, failure);
        assert.deepEqual(statuses, mode === 'file failure' ? ['pending', 'failed'] : ['pending', 'ready', 'pending']);
        assert.equal(current.status, mode === 'file failure' ? 'failed' : 'pending');
        assert.equal(current.verifiedAt, null);
        if (mode === 'ready and rollback failure') assert.equal(failure.statusPersistError, rollbackFailure);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test('migration transformer consumes READY/MISSING from checked files without trusting stored status', () => {
  const directory = mkdtempSync(join(tmpdir(), 'knowra-status-migration-'));
  try {
    const bytes = Buffer.from('migrate');
    writeFileSync(join(directory, 'a-file.txt'), bytes);
    for (const status of [...statuses, 'invalid', undefined, null])
      for (const present of [true, false]) {
        const entries = [];
        const reportTools = {
          report: { attachmentFiles: [] },
          error(...args) {
            entries.push(['error', ...args]);
          },
          repair(...args) {
            entries.push(['repair', ...args]);
          },
          warn(...args) {
            entries.push(['warn', ...args]);
          }
        };
        const input = {
          id: present ? 'a' : 'missing',
          noteId: 'n',
          fileName: 'file.txt',
          storagePath: present ? 'a-file.txt' : 'missing-file.txt',
          status,
          size: bytes.length
        };
        const output = transformAttachment(input, {
          storageRootDir: directory,
          uploadsDir: directory,
          noteIds: new Set(['n']),
          allowMissingAttachments: true,
          fallbackTimestamp: '2026-10-23T00:00:00.000Z',
          reportTools
        });
        assert.equal(output.status, present ? 'ready' : 'missing');
        assert.equal(output.fileExists, present);
        assert.equal(output.verifiedAt, present ? '2026-10-23T00:00:00.000Z' : null);
        assert.equal(input.status, status);
        assert.deepEqual(
          entries.map(entry => entry[1]),
          present ? [] : ['ATTACHMENT_FILE_MISSING']
        );
      }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
