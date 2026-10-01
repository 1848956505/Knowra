import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const currentEntryDocuments = [
  'docs/任务盘点与验收索引.md',
  'docs/离线编辑与同步/同步世代重建与删除事实保护.md',
  'docs/离线编辑与同步/2026-10-01-当前阶段恢复中断补验.md',
  'docs/资产生命周期任务/README.md',
  'docs/资产生命周期任务/资产生命周期差距与实施方案.md',
  'docs/审查/README.md',
  'docs/审查/21-修复计划与进度.md',
  'docs/附件功能/附件闭环实现与验收.md',
  'docs/已归档/附件功能/2026-10-01-附件闭环收口.md',
  'docs/已归档/README.md',
  'docs/项目结构导航.md',
  'docs/前端/V4/README.md',
  'docs/前端/V4/04-分阶段实施任务书.md',
  'docs/前端/V4/V4-00.5/印格/V4-00.5-印格视觉冻结规范.md'
];

test('当前任务、归档及V4入口文档只引用存在的本地目标', () => {
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
