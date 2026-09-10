import assert from 'node:assert/strict';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { temporaryDirectory, openWorkspace } from './helpers.mjs';
import { lockDataDirectory } from '../src/data-directory.mjs';

for (const point of ['before', 'after']) {
  test(`真实进程强制终止：${point === 'before' ? '提交前回滚' : '提交后恢复'}正文及队列`, { timeout: 15000 }, async t => {
    const root = path.join(temporaryDirectory(t), 'data');
    const child = fork(fileURLToPath(new URL('./fixtures/crash-worker.mjs', import.meta.url)), [root, point], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
    const [message] = await once(child, 'message');
    assert.equal(message.type, 'kill-now');
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
    const release = lockDataDirectory(root);
    const restored = openWorkspace(root);
    const expected = point === 'before' ? '已提交基线' : '进程终止前的新内容';
    assert.equal(restored.store.state.notes[0].rawMarkdown, expected);
    const noteChanges = restored.store.readOutbox().flatMap(operation => operation.changes).filter(change => change.collection === 'notes');
    assert.equal(noteChanges.at(-1).value.rawMarkdown, expected);
    assert.equal(noteChanges.length, point === 'before' ? 1 : 2);
    restored.store.close();
    release();
  });
}
