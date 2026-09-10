import { openWorkspace, createNote } from '../helpers.mjs';
import { lockDataDirectory } from '../../src/data-directory.mjs';

const [root, crashPoint] = process.argv.slice(2);
lockDataDirectory(root);
let armed = false;
const workspace = openWorkspace(root, { beforeCommit() {
  if (armed && crashPoint === 'before') {
    process.send({ type: 'kill-now' });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  }
} });
const note = createNote(workspace, '已提交基线');
armed = true;
workspace.knowledge.noteService.updateNote(note.id, { rawMarkdown: '进程终止前的新内容' });
process.send({ type: 'kill-now' });
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
