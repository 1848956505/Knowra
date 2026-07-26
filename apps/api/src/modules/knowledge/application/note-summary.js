const SUMMARY_CHARACTER_LIMIT = 240;
const READING_CHARACTERS_PER_MINUTE = 360;

export function createNoteSummary(note) {
  const plainText = String(note?.plainText ?? '');
  const characterCount = countCharacters(plainText);

  return {
    id: note.id,
    spaceId: note.spaceId,
    folderId: note.folderId,
    title: note.title,
    summary: plainText.slice(0, SUMMARY_CHARACTER_LIMIT),
    characterCount,
    readingMinutes: Math.max(1, Math.ceil(characterCount / READING_CHARACTERS_PER_MINUTE)),
    outline: extractOutline(note.rawMarkdown),
    internalLinks: Array.isArray(note.internalLinks) ? [...note.internalLinks] : [],
    status: note.status,
    sourceType: note.sourceType,
    favorite: note.favorite,
    deleted: note.deleted,
    tagIds: Array.isArray(note.tagIds) ? [...note.tagIds] : [],
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    contentLoaded: false
  };
}

function extractOutline(markdown) {
  return String(markdown ?? '').split('\n').flatMap((line) => {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    return match ? [{ level: match[1].length, title: match[2].trim() }] : [];
  });
}

function countCharacters(value) {
  return String(value ?? '').replace(/\s/g, '').length;
}
