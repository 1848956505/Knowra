const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// 只接受草稿键和值，渲染进程不能指定文件路径。
function createDraftStore(directory) {
  const file = path.join(directory, 'recovery-drafts.json');
  function read() {
    if (!fs.existsSync(file)) return {};
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || value.version !== 1 || !value.drafts || typeof value.drafts !== 'object' || Array.isArray(value.drafts)) throw new Error('恢复草稿文件损坏，请保留文件后重试。');
    return value.drafts;
  }
  function write(key, draft) {
    if (typeof key !== 'string' || !key.startsWith('knowra:note-draft:v1:') || key.length > 2000) throw new Error('草稿标识无效');
    if (draft !== null && (!draft || typeof draft.markdown !== 'string' || typeof draft.baseMarkdown !== 'string' || JSON.stringify(draft).length > 20000000)) throw new Error('恢复草稿无效或过大');
    const drafts = read();
    if (draft === null) delete drafts[key]; else drafts[key] = draft;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `.draft-${crypto.randomUUID()}.tmp`);
    let fd;
    try {
      fd = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({ version: 1, drafts }));
      fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      fs.renameSync(temporary, file);
      if (process.platform !== 'win32') { const directoryFd = fs.openSync(directory, 'r'); try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); } }
    } finally { if (fd !== undefined) fs.closeSync(fd); fs.rmSync(temporary, { force: true }); }
  }
  return { read, write };
}
module.exports = { createDraftStore };
