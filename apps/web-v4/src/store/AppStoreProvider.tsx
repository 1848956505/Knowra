import { createContext, useContext, useRef, type PropsWithChildren } from 'react';
import { useStore } from 'zustand';
import { createAppStore, type AppStoreApi } from './createAppStore';
import type { AppStore, WorkspaceDependencies } from './types';

const AppStoreContext = createContext<AppStoreApi | null>(null);

export interface AppStoreProviderProps extends PropsWithChildren {
  dependencies: WorkspaceDependencies;
  store?: AppStoreApi;
}

export function AppStoreProvider({ children, dependencies, store }: AppStoreProviderProps) {
  const storeRef = useRef<AppStoreApi | null>(null);
  storeRef.current ??= store ?? createAppStore(dependencies);
  return <AppStoreContext.Provider value={storeRef.current}>{children}</AppStoreContext.Provider>;
}

export function useAppStore<T>(selector: (state: AppStore) => T): T {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('AppStoreProvider must wrap the V4 application.');
  return useStore(store, selector);
}
