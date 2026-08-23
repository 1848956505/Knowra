import type { AppStore, NavigationSlice } from '../types';

type SetStore = (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
type GetStore = () => AppStore;

export function createNavigationSlice(set: SetStore, get: GetStore): NavigationSlice {
  return {
    navigation: {
      activeWorkDomain: 'materials',
      activeDomainView: 'overview',
      selectedFolderId: null,
      selectedNoteId: null,
      openFolders: {},
      openNoteTabs: []
    },
    selectFolder(folderId) {
      const state = get();
      const selectedFolderId = folderId && state.serverData.foldersById[folderId] ? folderId : null;
      const visibleNotes = state.serverData.notes.filter((note) => (
        !note.deleted && (!selectedFolderId || note.folderId === selectedFolderId)
      ));
      const selectedNoteId = visibleNotes.some((note) => note.id === state.navigation.selectedNoteId)
        ? state.navigation.selectedNoteId
        : visibleNotes[0]?.id ?? null;
      set({
        navigation: {
          ...state.navigation,
          selectedFolderId,
          selectedNoteId,
          openNoteTabs: ensureSelectedTab(state.navigation.openNoteTabs, selectedNoteId)
        }
      });
    },
    selectNote(noteId) {
      const state = get();
      const selectedNoteId = state.serverData.notes.some((note) => !note.deleted && note.id === noteId)
        ? noteId
        : null;
      set({
        navigation: {
          ...state.navigation,
          selectedNoteId,
          openNoteTabs: ensureSelectedTab(state.navigation.openNoteTabs, selectedNoteId)
        }
      });
    },
    toggleFolder(folderId) {
      const state = get();
      if (!state.serverData.foldersById[folderId]) return;
      set({
        navigation: {
          ...state.navigation,
          openFolders: {
            ...state.navigation.openFolders,
            [folderId]: !state.navigation.openFolders[folderId]
          }
        }
      });
    },
    setActiveWorkDomain(domain) {
      const state = get();
      if (state.navigation.activeWorkDomain === domain) return;
      set({
        navigation: {
          ...state.navigation,
          activeWorkDomain: domain,
          activeDomainView: 'overview'
        }
      });
    }
  };
}

function ensureSelectedTab(openTabs: string[], selectedNoteId: string | null): string[] {
  if (!selectedNoteId || openTabs.includes(selectedNoteId)) return openTabs;
  return [...openTabs, selectedNoteId];
}
