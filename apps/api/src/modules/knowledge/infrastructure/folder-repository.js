export function createInMemoryFolderRepository(options = {}) {
  const folders = options.records ?? [];

  function persist() {
    options.onChange?.(folders);
  }

  return {
    save(folder) {
      const existingIndex = folders.findIndex((item) => item.id === folder.id);

      if (existingIndex === -1) {
        folders.push(folder);
        persist();
        return folder;
      }

      folders[existingIndex] = folder;
      persist();
      return folder;
    },
    findById(folderId) {
      return folders.find((folder) => folder.id === folderId) ?? null;
    },
    delete(folderId) {
      const existingIndex = folders.findIndex((folder) => folder.id === folderId);

      if (existingIndex === -1) {
        return null;
      }

      const [deletedFolder] = folders.splice(existingIndex, 1);
      options.onChange?.(folders);
      return deletedFolder;
    },
    list(options = {}) {
      return folders.filter((folder) => (options.spaceId ? folder.spaceId === options.spaceId : true) && ((options.includeDeleted === true || options.includeDeleted === 'true') || !folder.deletedAt));
    }
  };
}
