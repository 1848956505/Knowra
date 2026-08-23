import { createStore } from 'zustand/vanilla';
import { createNavigationSlice } from './slices/navigationSlice';
import { createNotesIndexSlice } from './slices/notesIndexSlice';
import { createStatusSlice } from './slices/statusSlice';
import { createWorkspaceSlice } from './slices/workspaceSlice';
import type { AppStore, WorkspaceDependencies } from './types';

export function createAppStore(dependencies: WorkspaceDependencies) {
  return createStore<AppStore>()((set, get) => ({
    ...createStatusSlice(set),
    ...createNavigationSlice(set, get),
    ...createNotesIndexSlice(set, get, dependencies.api.searchNoteIds),
    ...createWorkspaceSlice(set, get, dependencies)
  }));
}

export type AppStoreApi = ReturnType<typeof createAppStore>;
