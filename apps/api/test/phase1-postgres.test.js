import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const phase1PostgresTests = [
  {
    name: 'storage config exposes local-json as the safe default and postgres as an opt-in driver',
    async run() {
      const { createStorageConfig } = await import('../src/config/storage.config.js');
      assert.equal(createStorageConfig({}).persistenceDriver, 'local-json');
      assert.equal(createStorageConfig({ PERSISTENCE_DRIVER: 'postgres', DATABASE_URL: 'postgresql://db' }).persistenceDriver, 'postgres');
      assert.equal(createStorageConfig({ PERSISTENCE_DRIVER: 'postgres', DATABASE_URL: 'postgresql://db' }).databaseUrl, 'postgresql://db');
      assert.throws(() => createStorageConfig({ PERSISTENCE_DRIVER: 'sqlite' }), /Unsupported PERSISTENCE_DRIVER/);
    }
  },
  {
    name: 'Prisma runtime can be tested with an injected client without opening a database connection',
    async run() {
      const { createPrismaRuntime } = await import('../src/infrastructure/prisma-client.js');
      let connected = 0;
      let disconnected = 0;
      const client = {
        async $connect() { connected += 1; },
        async $disconnect() { disconnected += 1; }
      };
      const runtime = createPrismaRuntime({ client });
      await runtime.connect();
      await runtime.connect();
      await runtime.disconnect();
      assert.equal(connected, 1);
      assert.equal(disconnected, 1);
    }
  },
  {
    name: 'JSON migration plan preserves ids, soft deletes, tags, hashes and timestamp repairs',
    async run() {
      const { buildJsonMigrationPlan } = await import('../src/infrastructure/migration/json-to-postgres.js');
      const fallbackTimestamp = '2026-07-27T00:00:00.000Z';
      const result = buildJsonMigrationPlan({
        input: {
          spaces: [{ id: 'space-demo', userId: 'demo', name: 'Default' }],
          folders: [],
          tags: [{ id: 'tag-中文', spaceId: 'space-demo', name: '中文', color: '#fff' }],
          notes: [{
            id: 'note-1',
            spaceId: 'space-demo',
            title: 'Deleted',
            rawMarkdown: 'hello [[note-2]]',
            deleted: true,
            tagIds: ['tag-中文']
          }],
          attachments: [],
          contentAnnotations: []
        },
        fallbackTimestamp
      });
      assert.equal(result.canApply, true);
      assert.equal(result.plan.users[0].id, 'demo');
      assert.equal(result.plan.notes[0].deletedAt, fallbackTimestamp);
      assert.deepEqual(result.plan.notes[0].tagIds, ['tag-中文']);
      assert.deepEqual(result.plan.notes[0].internalLinks, ['note-2']);
      assert.equal(result.plan.notes[0].contentHash, crypto.createHash('sha256').update('hello [[note-2]]').digest('hex'));
      assert.equal(result.report.repairs.some((item) => item.code === 'NOTE_CREATED_AT_DEFAULTED'), true);
    }
  },
  {
    name: 'PostgreSQL app context is opt-in and can be assembled with an injected Prisma client',
    async run() {
      const { createPostgresAppContext } = await import('../src/postgres-app.factory.js');
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-phase1-context-'));
      let ownerUpserts = 0;
      try {
        const model = () => ({
          async findUnique() { return null; },
          async findMany() { return []; },
          async findFirst() { return null; },
          async upsert() { return {}; },
          async count() { return 0; },
          async delete() { return {}; },
          async deleteMany() { return { count: 0 }; },
          async create() { return {}; },
          async createMany() { return { count: 0 }; },
          async update() { return {}; }
        });
        const client = {
          user: { ...model(), async upsert() { ownerUpserts += 1; return {}; } },
          knowledgeSpace: model(),
          folder: model(),
          tag: model(),
          note: model(),
          noteTag: model(),
          attachment: model(),
          contentAnnotation: model(),
          async $connect() {},
          async $disconnect() {},
          async $transaction(operation) { return operation(this); }
        };
        const app = await createPostgresAppContext({ client, storageRootDir: tempRoot });
        assert.equal(app.driver, 'postgres');
        assert.equal(typeof app.http.knowledge.createNote, 'function');
        assert.equal(typeof app.http.storage.exportKnowledgeBase, 'function');
        assert.equal(ownerUpserts, 1);
        await app.close();
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: 'JSON migration preflight blocks missing attachment files unless explicitly allowed',
    async run() {
      const { buildJsonMigrationPlan } = await import('../src/infrastructure/migration/json-to-postgres.js');
      const input = {
        spaces: [{ id: 'space-demo', userId: 'demo', name: 'Default' }],
        folders: [],
        tags: [],
        notes: [{ id: 'note-1', spaceId: 'space-demo', title: 'Note', rawMarkdown: 'body' }],
        attachments: [{ id: 'attachment-1', noteId: 'note-1', fileName: 'missing.txt', mimeType: 'text/plain', size: 3, storagePath: 'storage/uploads/missing.txt' }],
        contentAnnotations: []
      };
      const blocked = buildJsonMigrationPlan({ input, storageRootDir: os.tmpdir() });
      assert.equal(blocked.canApply, false);
      assert.equal(blocked.report.errors[0].code, 'ATTACHMENT_FILE_MISSING');
      const allowed = buildJsonMigrationPlan({ input, storageRootDir: os.tmpdir(), allowMissingAttachments: true });
      assert.equal(allowed.canApply, true);
      assert.equal(allowed.report.warnings[0].code, 'ATTACHMENT_FILE_MISSING');
    }
  },
  {
    name: 'JSON migration verifies an attachment file hash before applying metadata',
    async run() {
      const { buildJsonMigrationPlan } = await import('../src/infrastructure/migration/json-to-postgres.js');
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-phase1-migration-'));
      try {
        const uploadPath = path.join(tempRoot, 'storage', 'uploads', 'attachment-1-file.txt');
        fs.mkdirSync(path.dirname(uploadPath), { recursive: true });
        fs.writeFileSync(uploadPath, 'abc');
        const result = buildJsonMigrationPlan({
          input: {
            spaces: [{ id: 'space-demo', userId: 'demo', name: 'Default' }],
            folders: [],
            tags: [],
            notes: [{ id: 'note-1', spaceId: 'space-demo', title: 'Note', rawMarkdown: 'body' }],
            attachments: [{ id: 'attachment-1', noteId: 'note-1', fileName: 'file.txt', mimeType: 'text/plain', size: 99, storagePath: 'storage/uploads/attachment-1-file.txt' }],
            contentAnnotations: []
          },
          storageRootDir: tempRoot
        });
        assert.equal(result.canApply, true);
        assert.equal(result.plan.attachments[0].size, 3);
        assert.equal(result.report.attachmentFiles[0].exists, true);
        assert.equal(result.report.repairs.some((item) => item.code === 'ATTACHMENT_SIZE_REPAIRED'), true);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  }
];
