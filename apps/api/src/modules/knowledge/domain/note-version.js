import crypto from 'node:crypto';

export class NoteVersion {
  constructor({
    id,
    noteId,
    content,
    contentHash = calculateContentHash(content),
    createdAt = new Date().toISOString(),
    createdBy = 'user'
  }) {
    if (!id?.trim() || !noteId?.trim()) {
      throw new Error('NoteVersion identity is required');
    }
    if (typeof content !== 'string') {
      throw new Error('NoteVersion content is required');
    }
    if (!/^[a-f0-9]{64}$/i.test(contentHash)) {
      throw new Error('NoteVersion contentHash is invalid');
    }
    if (!createdBy?.trim()) {
      throw new Error('NoteVersion createdBy is required');
    }

    Object.assign(this, {
      id,
      noteId,
      content,
      contentHash: contentHash.toLowerCase(),
      createdAt,
      createdBy
    });
    Object.freeze(this);
  }
}

export function calculateContentHash(content) {
  return crypto.createHash('sha256').update(String(content ?? '')).digest('hex');
}
