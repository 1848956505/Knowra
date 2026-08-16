import {
  BACKEND_WORKSPACE_CACHE_KEY,
  apiClient,
  createEmptyWorkspaceSnapshot,
  createWorkspaceApi,
  type KeyValueStorage
} from '@study-accelerator/web-core';
import type { PropsWithChildren } from 'react';
import { AppStoreProvider } from '../store/AppStoreProvider';
import type { AppStoreApi } from '../store/createAppStore';

export interface AppProvidersProps extends PropsWithChildren {
  store?: AppStoreApi;
}

export function AppProviders({ children, store }: AppProvidersProps) {
  return (
    <AppStoreProvider
      store={store}
      dependencies={{
        api: createWorkspaceApi({ requestJson: apiClient.requestJson }),
        storage: getBrowserStorage(),
        cacheKey: BACKEND_WORKSPACE_CACHE_KEY,
        mockSnapshot: createEmptyWorkspaceSnapshot()
      }}
    >
      {children}
    </AppStoreProvider>
  );
}

function getBrowserStorage(): KeyValueStorage | null {
  try { return globalThis.localStorage; } catch { return null; }
}
