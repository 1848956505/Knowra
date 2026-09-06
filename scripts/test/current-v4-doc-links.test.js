import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const currentEntryDocuments = [
  'docs/前端重构/V4/README.md',
  'docs/前端重构/V4/04-分阶段实施任务书.md',
  'docs/前端重构/V4/V4-00.5/印格/V4-00.5-印格视觉冻结规范.md'
];

test('current V4 entry documents only reference existing local targets', () => {
  const missing = [];
  for (const relativeFile of currentEntryDocuments) {
    const file = path.join(workspaceRoot, relativeFile);
    const markdown = readFileSync(file, 'utf8');
    for (const match of markdown.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)) {
      let target = match[1].trim().replace(/^<|>$/g, '');
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      target = decodeURIComponent(target.split('#')[0]);
      if (!existsSync(path.resolve(path.dirname(file), target))) {
        missing.push(`${relativeFile} -> ${target}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
