export function dbUser(user) {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    nickname: user.nickname,
    status: user.status,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt)
  };
}

export function dbSpace(space) {
  return {
    id: space.id,
    userId: space.userId,
    name: space.name,
    description: space.description,
    defaultFlag: space.defaultFlag,
    createdAt: new Date(space.createdAt),
    updatedAt: new Date(space.updatedAt)
  };
}

export function dbFolder(folder) {
  return {
    id: folder.id,
    spaceId: folder.spaceId,
    parentId: folder.parentId,
    name: folder.name,
    sortOrder: folder.sortOrder,
    pathCache: folder.pathCache,
    createdAt: new Date(folder.createdAt),
    updatedAt: new Date(folder.updatedAt)
  };
}

export function dbTag(tag) {
  return {
    id: tag.id,
    spaceId: tag.spaceId,
    name: tag.name,
    color: tag.color,
    groupId: tag.groupId,
    code: tag.code,
    isSystem: tag.isSystem,
    sortOrder: tag.sortOrder,
    createdAt: new Date(tag.createdAt),
    updatedAt: new Date(tag.updatedAt)
  };
}

export function dbNote(note) {
  return {
    id: note.id,
    spaceId: note.spaceId,
    folderId: note.folderId,
    title: note.title,
    rawMarkdown: note.rawMarkdown,
    plainText: note.plainText,
    internalLinks: note.internalLinks,
    contentHash: note.contentHash,
    status: note.status,
    sourceType: note.sourceType,
    favorite: note.favorite,
    deletedAt: note.deletedAt ? new Date(note.deletedAt) : null,
    createdAt: new Date(note.createdAt),
    updatedAt: new Date(note.updatedAt)
  };
}

export function dbAnnotation(annotation) {
  return {
    id: annotation.id,
    spaceId: annotation.spaceId,
    noteId: annotation.noteId,
    kind: annotation.kind,
    sourceMode: annotation.sourceMode,
    quoteText: annotation.quoteText,
    headingPath: annotation.headingPath,
    fromPosition: annotation.fromPosition,
    toPosition: annotation.toPosition,
    prefixText: annotation.prefixText,
    suffixText: annotation.suffixText,
    anchorFingerprint: annotation.anchorFingerprint,
    noteContentHash: annotation.noteContentHash,
    idempotencyKey: annotation.idempotencyKey,
    status: annotation.status,
    createdAt: new Date(annotation.createdAt),
    updatedAt: new Date(annotation.updatedAt),
    deletedAt: annotation.deletedAt ? new Date(annotation.deletedAt) : null
  };
}

export function dbAttachment(attachment) {
  return {
    id: attachment.id,
    noteId: attachment.noteId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    storagePath: attachment.storagePath,
    createdAt: new Date(attachment.createdAt)
  };
}
