import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const contract = JSON.parse(read('contracts/ai-v1.schema.json'));
const tools = JSON.parse(read('contracts/tool-calls-v1.schema.json'));
const sources = JSON.parse(read('fixtures/sources-v1.json'));
const quality = readJsonLines('fixtures/quality-v1.jsonl');
const adversarial = readJsonLines('fixtures/adversarial-v1.jsonl');

for (const [name, schema, required] of [
  ['runtime', contract, ['scopeSnapshot', 'contextManifest', 'aiGrant', 'aiJob', 'aiJobAttempt', 'aiAction', 'aiArtifactProvenance', 'aiUsageRecord']],
  ['tools', tools, ['notesSearch', 'notesRead', 'foldersList', 'tagsList', 'notesCreate', 'notesAppend', 'notesProposePatch', 'notesProposeOrganize']]
]) {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', `${name}: schema draft`);
  for (const key of required) {
    const definition = schema.$defs[key];
    assert(definition && definition.additionalProperties === false, `${name}: ${key} must be closed`);
    assert(definition.required.every(field => Object.hasOwn(definition.properties, field)), `${name}: ${key} required fields`);
  }
  walk(schema, node => {
    if (node.$ref) assert(node.$ref.startsWith('#/$defs/') && schema.$defs[node.$ref.slice(8)], `${name}: unresolved ${node.$ref}`);
  });
}

assert.equal(sources.version, 'p0-synthetic-v1');
const sourceById = new Map(sources.notes.map(note => [note.id, note]));
assert.equal(sourceById.size, sources.notes.length);
assert.equal(quality.length, 80);
assert.equal(adversarial.length, 20);
const expectedCategories = { read: 20, writePlan: 15, extraction: 15, question: 15, grading: 15 };
for (const [category, count] of Object.entries(expectedCategories)) {
  assert.equal(quality.filter(item => item.category === category).length, count, `${category} sample count`);
}
assert.equal(quality.filter(item => item.split === 'dev').length, 50);
assert.equal(quality.filter(item => item.split === 'holdout').length, 30);
assert.equal(adversarial.filter(item => item.split === 'dev').length, 10);
assert.equal(adversarial.filter(item => item.split === 'holdout').length, 10);

const ids = new Set();
for (const item of [...quality, ...adversarial]) {
  assert(!ids.has(item.id), `duplicate fixture ${item.id}`);
  ids.add(item.id);
  assert(['dev', 'holdout'].includes(item.split));
  assert(Array.isArray(item.sourceIds) && item.sourceIds.length > 0);
  assert(typeof item.request === 'string' && item.request.length > 3);
  assert(typeof item.reference === 'string' && item.reference.length >= 2);
  assert(typeof item.forbidden === 'string' && item.forbidden.length >= 2);
  assert(typeof item.expected === 'string' && item.expected.length > 1);
  const notes = item.sourceIds.map(id => {
    assert(sourceById.has(id), `${item.id}: unknown source ${id}`);
    return sourceById.get(id);
  });
  if (item.goldQuote) assert(notes.some(note => note.body.includes(item.goldQuote)), `${item.id}: gold quote outside selected sources`);
  if (item.excludedQuote) {
    assert(notes.some(note => note.body.includes(item.excludedQuote)), `${item.id}: exclusion outside fixture sources`);
    assert(!item.goldQuote?.includes(item.excludedQuote), `${item.id}: excluded quote in gold`);
  }
  if (new Set(notes.map(note => note.spaceId)).size > 1) {
    assert(['clarify', 'review'].includes(item.expected), `${item.id}: cross-space case must not be directly executed`);
  }
  if (item.category === 'adversarial') assert(typeof item.untrustedText === 'string' && item.untrustedText.length > 10);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-p0-sqlite-'));
const dbPath = path.join(tempDir, 'schema-check.sqlite');
const db = new DatabaseSync(dbPath);
try {
  // P0 的冻结迁移仍以隔离的 v3 基线验证；当前运行库已升至 v4。
  db.exec(`CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE entities (collection TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL,
      local_revision INTEGER NOT NULL, PRIMARY KEY (collection, id));
    CREATE TABLE sync_outbox (sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT UNIQUE NOT NULL,
      device_id TEXT NOT NULL, protocol_version INTEGER NOT NULL, state TEXT NOT NULL,
      changes TEXT NOT NULL, dependencies TEXT NOT NULL, created_at TEXT NOT NULL);
    PRAGMA user_version = 3;`);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  db.exec('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;');
  db.exec(read('contracts/sqlite-v4-migration.sql'));
  db.prepare('INSERT INTO metadata(key, value) VALUES (?, ?)').run('aiRuntimeEpoch', randomUUID());
  db.exec('PRAGMA user_version = 4; COMMIT;');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  for (const name of ['ai_scope_snapshots', 'ai_context_manifests', 'ai_grants', 'ai_jobs', 'ai_job_attempts', 'ai_actions', 'ai_usage_records', 'ai_job_events', 'entities', 'sync_outbox']) assert(names.has(name), `missing ${name}`);
  insert(db, 'ai_scope_snapshots', {
    scope_snapshot_id: 'scope-1', owner_id: 'demo', dataset_id: 'dataset-1', dataset_epoch: 'epoch-1',
    space_id: 'space-1', scope_hash: 'a'.repeat(64), snapshot_json: '{}', created_at: '2026-09-26T00:00:00Z'
  });
  insert(db, 'ai_context_manifests', {
    manifest_id: 'manifest-1', scope_snapshot_id: 'scope-1', owner_id: 'demo', dataset_id: 'dataset-1',
    dataset_epoch: 'epoch-1', space_id: 'space-1', manifest_hash: 'c'.repeat(64), payload_hash: 'd'.repeat(64),
    manifest_json: '{}', created_at: '2026-09-26T00:00:00Z'
  });
  insert(db, 'ai_grants', {
    grant_id: 'grant-1', actor_id: 'actor-1', entrypoint: 'assistant', owner_id: 'demo', dataset_id: 'dataset-1',
    dataset_epoch: 'epoch-1', space_id: 'space-1', scope_snapshot_id: 'scope-1', scope_hash: 'a'.repeat(64), allowed_tools_json: '["notes_read"]',
    action_kinds_json: '["read"]', max_targets: 0, issued_at: '2026-09-26T00:00:00Z', expires_at: '2026-09-27T00:00:00Z', revoked_at: null
  });
  const job = {
    job_id: 'job-1', request_id: 'request-1', parent_job_id: null, owner_id: 'demo', dataset_id: 'dataset-1',
    dataset_epoch: 'epoch-1', space_id: 'space-1', grant_id: 'grant-1', job_kind: 'answer', idempotency_key: 'same-key',
    input_hash: 'b'.repeat(64), manifest_id: 'manifest-1', manifest_hash: 'c'.repeat(64), credential_ref: 'credential-1', provider: 'deepseek',
    model_id: 'deepseek-flash', prompt_version: 'prompt-1', result_schema_version: '1', status: 'pending', phase: 'preparing',
    accepted_attempt_id: null, output_hash: null, created_at: '2026-09-26T00:00:00Z', updated_at: '2026-09-26T00:00:00Z'
  };
  insert(db, 'ai_jobs', job);
  assert.throws(() => insert(db, 'ai_jobs', { ...job, job_id: 'job-2', request_id: 'request-2' }), /UNIQUE constraint failed/, 'idempotency unique key');
  assert.throws(() => insert(db, 'ai_jobs', { ...job, job_id: 'job-3', request_id: 'request-3', idempotency_key: 'new-key', grant_id: 'missing-grant' }), /FOREIGN KEY constraint failed/, 'grant foreign key');
  assert.throws(() => insert(db, 'ai_jobs', { ...job, job_id: 'job-4', request_id: 'request-4', idempotency_key: 'another-key', manifest_id: 'missing-manifest' }), /FOREIGN KEY constraint failed/, 'manifest foreign key');
} finally {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const digest = createHash('sha256').update(read('fixtures/sources-v1.json')).update(read('fixtures/quality-v1.jsonl')).update(read('fixtures/adversarial-v1.jsonl')).digest('hex');
console.log(`P0 v1 校验通过：运行对象 8 类、工具 8 个、合成来源 ${sources.notes.length} 篇、质量样本 ${quality.length} 条、对抗样本 ${adversarial.length} 条；SQLite v3→v4 草案在隔离库可执行。`);
console.log(`样本集 SHA-256：${digest}`);

function readJsonLines(relative) {
  return read(relative).trim().split('\n').map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`${relative}:${index + 1} JSON 无效`); }
  });
}

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}

function insert(db, table, record) {
  const columns = Object.keys(record);
  const placeholders = columns.map(() => '?').join(',');
  db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`).run(...Object.values(record));
}
