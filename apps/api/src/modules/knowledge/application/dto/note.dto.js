import { trimIfString, createSlug } from './_shared.js';

function deriveTitleFromMarkdown(markdown) {
  if (typeof markdown !== 'string') {
    return null;
  }

  const headingMatch = markdown.match(/^\s*#\s+(.+)$/m);
  if (headingMatch?.[1]?.trim()) {
    return headingMatch[1].trim();
  }

  const firstLine = markdown
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return null;
  }

  return firstLine.replace(/^[-*>\d.\s]+/, '').trim().slice(0, 80) || null;
}

function createNoteId({ id, title, rawMarkdown }) {
  if (trimIfString(id)) {
    return trimIfString(id);
  }

  const seed = createSlug(title || deriveTitleFromMarkdown(rawMarkdown) || 'note');
  return `note-${seed || 'item'}-${Date.now()}`;
}

export function buildCreateNoteDto(input) {
  const title = trimIfString(input.title) || deriveTitleFromMarkdown(input.rawMarkdown) || 'Untitled Note';

  return {
    id: createNoteId({
      id: input.id,
      title,
      rawMarkdown: input.rawMarkdown
    }),
    title,
    rawMarkdown: input.rawMarkdown,
    spaceId: input.spaceId ?? null,
    folderId: input.folderId ?? null,
    status: input.status ?? 'draft',
    sourceType: input.sourceType ?? 'manual',
    favorite: input.favorite ?? false,
    tagIds: input.tagIds ?? [],
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

export function buildUpdateNoteDto(input) {
  const dto = {};

  if (input.title !== undefined) {
    dto.title = trimIfString(input.title);
  }
  if (input.rawMarkdown !== undefined) {
    dto.rawMarkdown = input.rawMarkdown;
  }
  if (input.spaceId !== undefined) {
    dto.spaceId = input.spaceId;
  }
  if (input.folderId !== undefined) {
    dto.folderId = input.folderId;
  }
  if (input.status !== undefined) {
    dto.status = input.status;
  }
  if (input.sourceType !== undefined) {
    dto.sourceType = input.sourceType;
  }
  if (input.favorite !== undefined) {
    dto.favorite = input.favorite;
  }
  if (input.tagIds !== undefined) {
    dto.tagIds = input.tagIds;
  }
  if (input.updatedAt !== undefined) {
    dto.updatedAt = input.updatedAt;
  }

  return dto;
}
