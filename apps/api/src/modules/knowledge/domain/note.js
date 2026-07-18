function stripMarkdown(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractInternalLinks(markdown) {
  const matches = String(markdown ?? '').match(/\[\[([^\]]+)\]\]/g) ?? [];
  return [...new Set(matches.map((value) => value.slice(2, -2).trim()).filter(Boolean))];
}

export class Note {
  constructor({
    id,
    spaceId = null,
    folderId = null,
    title,
    rawMarkdown,
    status = 'draft',
    sourceType = 'manual',
    favorite = false,
    deleted = false,
    tagIds = [],
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim()) {
      throw new Error('Note id is required');
    }
    if (!title?.trim()) {
      throw new Error('Note title is required');
    }
    if (typeof rawMarkdown !== 'string') {
      throw new Error('Note rawMarkdown is required');
    }

    this.id = id;
    this.spaceId = spaceId;
    this.folderId = folderId;
    this.title = title.trim();
    this.rawMarkdown = rawMarkdown;
    this.plainText = stripMarkdown(rawMarkdown);
    this.internalLinks = extractInternalLinks(rawMarkdown);
    this.status = status;
    this.sourceType = sourceType;
    this.favorite = favorite;
    this.deleted = deleted;
    this.tagIds = [...new Set(tagIds)];
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export function derivePlainText(markdown) {
  return stripMarkdown(markdown);
}

export function deriveInternalLinks(markdown) {
  return extractInternalLinks(markdown);
}
