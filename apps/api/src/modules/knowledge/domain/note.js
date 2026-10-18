import { stripKnowraMarks } from '@study-accelerator/shared/knowra-marks';
import { updateStructure, extractNoteLinks } from '@study-accelerator/content-anchor';
function stripMarkdown(markdown) {
  // 先去掉 Knowra 标记（重点、挖空），否则搜索、摘要会被标签打断。
  return stripKnowraMarks(markdown)
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
  return extractNoteLinks(markdown).targetIds;
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
    aiVisibility = 'normal',
    deleted = false,
    tagIds = [],
    plainText,
    internalLinks,
    contentHash = null,
    annotationStructure = null,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt,
    folderDeletionPackageId = null,
    deletionPackage = null
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
    this.plainText = typeof plainText === 'string'
      ? plainText
      : stripMarkdown(rawMarkdown);
    this.internalLinks = Array.isArray(internalLinks)
      ? [...new Set(internalLinks)]
      : extractInternalLinks(rawMarkdown);
    this.contentHash = contentHash;
    this.annotationStructure = annotationStructure ?? updateStructure('', rawMarkdown);
    this.status = status;
    this.sourceType = sourceType;
    this.favorite = favorite;
    this.aiVisibility = aiVisibility;
    this.deleted = deleted;
    this.tagIds = [...new Set(tagIds)];
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.folderDeletionPackageId = folderDeletionPackageId;
    this.deletionPackage = deletionPackage;
  }
}
