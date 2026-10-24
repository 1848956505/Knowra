import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { migrationReportContractCases } from './migration-report.contract-support.js';

// 普通运行零 Git；显式历史模式只读取准确实际父提交的旧叶子，缺对象即失败。
const baseline = process.env.KNOWRA_MIGRATION_REPORT_BASELINE === '1';
const parent = '289dba403f5cf27bd11eaf3defa05949d74cdab3';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/infrastructure/migration/migration-report.js';
const sourceUrl = baseline
  ? `data:text/javascript;base64,${Buffer.from(execFileSync('git', ['show', `${parent}:${helper}`], { cwd: root, encoding: 'utf8' })).toString('base64')}`
  : new URL(helper, root).href;
const api = await import(sourceUrl);

for (const entry of migrationReportContractCases(api)) test(entry.name, entry.run);

test('JS bridge exports only the identical synchronous TS factory', { skip: baseline }, async () => {
  const ts = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(api), ['createMigrationReport']);
  assert.deepEqual(Object.keys(ts), ['createMigrationReport']);
  assert.equal(api.createMigrationReport, ts.createMigrationReport);
  assert.equal(api.createMigrationReport.constructor.name, 'Function');
});

// 真实消费者仅验证当前检出；历史模式不冒充整个历史依赖图。合成内存、受控临时附件和显式 PG stub，无连接/socket。
if (!baseline) {
  const { buildJsonMigrationPlan, applyJsonMigration } =
    await import('../src/infrastructure/migration/json-to-postgres.js');
  const { transformNote, transformNoteVersion, transformAttachment, checksumPlan } =
    await import('../src/infrastructure/migration/json-transformers.js');
  const { phase1PostgresTests } = await import('./phase1-postgres.test.js');
  const stamp = '2026-10-01T00:00:00.000Z';
  const hash = value => createHash('sha256').update(value).digest('hex');

  test('actual note and version transformers append ordered repairs and raw hash errors to these tools', () => {
    const tools = api.createMigrationReport({ generatedAt: 'fixed' });
    const note = transformNote({ id: 'note', rawMarkdown: 'body [[target]]', contentHash: 'wrong-note' }, stamp, tools);
    const version = transformNoteVersion(
      { id: 'version', content: 'version body', contentHash: 'wrong-version' },
      stamp,
      tools
    );
    assert.deepEqual(
      tools.report.repairs.map(entry => entry.code),
      [
        'NOTE_CREATED_AT_DEFAULTED',
        'NOTE_UPDATED_AT_DEFAULTED',
        'NOTE_INTERNAL_LINKS_DERIVED',
        'NOTE_VERSION_CREATED_AT_DEFAULTED'
      ]
    );
    assert.deepEqual(
      tools.report.repairs.map(entry => entry.noteId ?? entry.noteVersionId),
      ['note', 'note', 'note', 'version']
    );
    assert.deepEqual(tools.report.errors, [
      {
        code: 'NOTE_CONTENT_HASH_MISMATCH',
        message: 'Note contentHash does not match rawMarkdown',
        noteId: 'note',
        expectedHash: hash('body [[target]]'),
        actualHash: 'wrong-note'
      },
      {
        code: 'NOTE_VERSION_HASH_MISMATCH',
        message: 'NoteVersion contentHash does not match its content',
        noteVersionId: 'version',
        expectedHash: hash('version body'),
        actualHash: 'wrong-version'
      }
    ]);
    assert.equal(note.contentHash, hash('body [[target]]'));
    assert.deepEqual(note.internalLinks, ['target']);
    assert.equal(version.createdAt, stamp);
    assert.equal(tools.finish(), tools.report);
    assert.equal(tools.report.status, 'blocked');
  });

  test('actual preflight rejects invalid synthetic snapshot without IO and keeps original report schema', () => {
    const result = buildJsonMigrationPlan({
      input: null,
      sourceFile: 'synthetic.json',
      storageRootDir: '/synthetic-only'
    });
    assert.equal(result.canApply, false);
    assert.equal(result.plan, null);
    assert.equal(result.report.status, 'blocked');
    assert.equal(result.report.errors.length, 1);
    assert.equal(result.report.errors[0].code, 'STORAGE_SNAPSHOT_INVALID');
    assert.equal(result.report.sourceFile, 'synthetic.json');
    assert.equal(result.report.storageRootDir, '/synthetic-only');
    assert.equal(result.report.checksum, null);
    assert.deepEqual(result.report.counts, {});
    assert.deepEqual(result.report.attachmentFiles, []);
  });

  test('actual attachment transformer records repaired size/hash error and missing-file warning in disposable storage', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-report-contract-'));
    try {
      const uploads = path.join(temp, 'storage', 'uploads');
      fs.mkdirSync(uploads, { recursive: true });
      const filePath = path.join(uploads, 'attachment-file.txt');
      fs.writeFileSync(filePath, 'abc');
      const tools = api.createMigrationReport({ generatedAt: 'fixed' });
      const context = {
        storageRootDir: temp,
        uploadsDir: uploads,
        noteIds: new Set(['note']),
        allowMissingAttachments: true,
        fallbackTimestamp: stamp,
        reportTools: tools
      };
      const result = transformAttachment(
        {
          id: 'attachment',
          noteId: 'note',
          storagePath: 'storage/uploads/attachment-file.txt',
          fileName: 'file.txt',
          size: 99,
          sha256: 'wrong'
        },
        context
      );
      assert.equal(result.size, 3);
      assert.equal(result.sha256, hash('abc'));
      assert.equal(result.fileExists, true);
      assert.deepEqual(tools.report.repairs, [
        {
          code: 'ATTACHMENT_SIZE_REPAIRED',
          message: 'Attachment size was aligned to the file on disk',
          attachmentId: 'attachment',
          previousSize: 99,
          size: 3
        }
      ]);
      assert.equal(tools.report.errors[0].code, 'ATTACHMENT_HASH_MISMATCH');
      assert.deepEqual(tools.report.attachmentFiles, [
        { attachmentId: 'attachment', filePath, exists: true, size: 3, contentSha256: hash('abc') }
      ]);
      const missing = transformAttachment(
        {
          id: 'missing',
          noteId: 'note',
          storagePath: 'storage/uploads/missing-missing.txt',
          fileName: 'missing.txt',
          size: 5
        },
        context
      );
      assert.equal(missing.fileExists, false);
      assert.equal(tools.report.warnings[0].code, 'ATTACHMENT_FILE_MISSING');
      assert.equal(tools.report.warnings[0].attachmentId, 'missing');
      assert.equal(tools.report.attachmentFiles[1].exists, false);
      assert.equal(tools.finish().status, 'blocked');
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
    assert.equal(fs.existsSync(temp), false);
  });

  test('actual plan counts/checksum and explicit PG stub apply preserve the very same report identity', async () => {
    const input = {
      spaces: [{ id: 'space', userId: 'demo', name: 'Synthetic' }],
      folders: [],
      tags: [],
      notes: [],
      attachments: [],
      contentAnnotations: []
    };
    const before = structuredClone(input);
    const prepared = buildJsonMigrationPlan({ input, ownerId: 'demo', fallbackTimestamp: stamp });
    assert.equal(prepared.canApply, true);
    assert.equal(prepared.report.status, 'ready');
    assert.equal(prepared.report.checksum, checksumPlan(prepared.plan));
    for (const [collection, value] of Object.entries(prepared.report.counts))
      assert.equal(value, prepared.plan[collection].length);
    const events = [];
    const client = {
      async $transaction(operation, options) {
        events.push(['transaction', options.isolationLevel]);
        return operation({
          async $queryRawUnsafe(sql) {
            events.push(['lock', /pg_advisory_xact_lock\(/.test(sql)]);
          },
          knowledgeArtifactProvenance: {
            async findMany() {
              events.push(['read provenance']);
              return [];
            }
          },
          user: {
            async createMany({ data }) {
              events.push(['users', data.length]);
            }
          },
          knowledgeSpace: {
            async createMany({ data }) {
              events.push(['spaces', data.length]);
            }
          },
          tagGroup: {
            async createMany({ data }) {
              events.push(['groups', data.length]);
            }
          }
        });
      }
    };
    const original = prepared.report;
    original.externalMarker = { untouched: true };
    const marker = original.externalMarker;
    const applied = await applyJsonMigration({
      client,
      plan: prepared.plan,
      report: original,
      requireEmptyTarget: false
    });
    assert.equal(applied, original);
    assert.equal(applied.externalMarker, marker);
    assert.equal(applied.status, 'applied');
    assert.equal(typeof applied.appliedAt, 'string');
    assert.deepEqual(events, [
      ['transaction', 'Serializable'],
      ['lock', true],
      ['read provenance'],
      ['users', 1],
      ['spaces', 1],
      ['groups', prepared.plan.tagGroups.length]
    ]);
    assert.deepEqual(input, before);
  });

  for (const name of [
    'JSON migration plan preserves ids, soft deletes, tags, hashes and timestamp repairs',
    'JSON migration verifies an attachment file hash before applying metadata',
    'versioned JSON migration wrappers keep strict reference validation',
    'JSON migration apply holds the exclusive PostgreSQL advisory lock'
  ])
    test(`existing phase1 contract actually runs: ${name}`, async () => {
      const matches = phase1PostgresTests.filter(entry => entry.name === name);
      assert.equal(matches.length, 1, `Exact existing test missing or duplicated: ${name}`);
      await matches[0].run();
    });
}
