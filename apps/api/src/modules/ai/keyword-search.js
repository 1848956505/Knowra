import { calculateContentHash } from '../knowledge/domain/note-version.js';

const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const normalize = value => value.normalize('NFKC').toLocaleLowerCase();
const normalizeWithOffsets = value => {
  let text = '';
  const offsets = [];
  for (let index = 0; index < value.length;) {
    const character = String.fromCodePoint(value.codePointAt(index));
    const folded = normalize(character);
    for (let unit = 0; unit < folded.length; unit++) offsets.push(index);
    text += folded;
    index += character.length;
  }
  offsets.push(value.length);
  return { text, offsets };
};
const tokens = query => {
  const text = normalize(query);
  const words = text.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const grams = [...text.matchAll(/[\p{Script=Han}]{2,}/gu)]
    .flatMap(([chunk]) => Array.from({ length: Math.max(0, chunk.length - 1) }, (_, i) => chunk.slice(i, i + 2)));
  return [...new Set([...words, ...grams])].filter(value => value.length >= 2).slice(0, 48);
};
const boundary = (text, index) => index <= 0 || index >= text.length
  || !(text.charCodeAt(index - 1) >= 0xD800 && text.charCodeAt(index - 1) <= 0xDBFF
    && text.charCodeAt(index) >= 0xDC00 && text.charCodeAt(index) <= 0xDFFF);

/** 可替换的检索接口；所有候选先经过 R02 grant/当前版本检查，再计算关键词分数。 */
export function createAuthorizedKeywordSearch({ access, maxCandidates = 300, maxNoteChars = 200_000 } = {}) {
  if (!access?.listAuthorizedNotes || !access?.verifyRead) throw new TypeError('Authorized search needs R02 access service');
  return {
    async search({ grantId, query, limit = 5 }) {
      if (typeof query !== 'string' || !query.trim() || query.length > 300
        || !Number.isSafeInteger(limit) || limit < 1 || limit > 8) fail('AI_SEARCH_INVALID', '检索参数无效。');
      const terms = tokens(query);
      const candidates = await access.listAuthorizedNotes({ grantId });
      if (!terms.length) return { hits: [], inspected: 0, truncated: false };
      const scored = [];
      let skippedOversize = 0;
      for (const candidate of candidates.slice(0, maxCandidates)) {
        const { note, version, contentHash } = await access.verifyRead({ grantId,
          noteId: candidate.noteId, tool: 'notes_search' });
        if (version.content.length > maxNoteChars) { skippedOversize++; continue; }
        const content = version.content, indexed = normalizeWithOffsets(content), title = normalize(note.title);
        let score = 0, best = -1;
        for (const term of terms) {
          if (title.includes(term)) score += 5;
          const index = indexed.text.indexOf(term);
          if (index >= 0) { score += 2; if (best < 0 || indexed.offsets[index] < best) best = indexed.offsets[index]; }
        }
        if (!score) continue;
        let start = Math.max(0, best - 80), end = Math.min(content.length, start + 320);
        while (!boundary(content, start)) start--;
        while (!boundary(content, end)) end++;
        const text = content.slice(start, end);
        if (!text) continue;
        scored.push({ noteId: note.id, title: note.title, score, ref: {
          noteId: note.id, noteVersionId: version.id, contentHash,
          start, end, quoteHash: calculateContentHash(text)
        }, text });
      }
      scored.sort((a, b) => b.score - a.score || a.noteId.localeCompare(b.noteId));
      return { hits: scored.slice(0, limit), inspected: Math.min(candidates.length, maxCandidates),
        truncated: candidates.length > maxCandidates || skippedOversize > 0 };
    }
  };
}
