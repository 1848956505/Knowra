import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createNoteDraftRecovery } from './noteDraftRecovery';
import { useNoteAutosave } from './useNoteAutosave';

afterEach(() => { sessionStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('restores a conflict after editor unmount and page reload without changing its baseline', async () => {
  vi.useFakeTimers();
  const onSave = vi.fn().mockRejectedValue(Object.assign(new Error('冲突'), { status: 409 }));
  const options = { noteId: 'a', draftScope: 'space', remoteMarkdown: '原文', remoteUpdatedAt: 'v1', canWrite: true, onSave };
  const store = createNoteDraftRecovery();
  const first = renderHook(() => useNoteAutosave({ ...options, recoveryStore: store }));
  act(() => first.result.current.updateDraft('冲突草稿', { immediate: true }));
  await act(async () => vi.advanceTimersByTimeAsync(700));
  first.unmount();
  const freshStore = createNoteDraftRecovery();
  const second = renderHook(() => useNoteAutosave({ ...options, remoteMarkdown: '另一端正文', remoteUpdatedAt: 'v2', recoveryStore: freshStore }));
  expect(second.result.current.draftMarkdown).toBe('冲突草稿');
  expect(second.result.current.hasConflict).toBe(true);
  expect(freshStore.read('space', 'a')?.baseUpdatedAt).toBe('v1');
  await act(async () => vi.advanceTimersByTimeAsync(1400));
  expect(onSave).toHaveBeenCalledTimes(1);
  await expect(second.result.current.saveNow()).rejects.toThrow('冲突');
  second.unmount();
});

it('does not resurrect a removed draft in memory when browser storage removal fails', () => {
  const store = createNoteDraftRecovery();
  const draft = { markdown: 'draft', baseMarkdown: 'base' };
  store.write('s', 'removed', draft);
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
  store.remove('s', 'removed', draft);
  expect(store.read('s', 'removed')).toBeUndefined();
});

it('a late save from an unmounted editor cannot remove a newer recovered draft', async () => {
  vi.useFakeTimers();
  const store = createNoteDraftRecovery();
  let resolve!: (value: { updatedAt: string }) => void;
  const onSave = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
  const options = { noteId: 'late', draftScope: 'space', recoveryStore: store, remoteMarkdown: 'base', remoteUpdatedAt: 'v1', canWrite: true, onSave };
  const first = renderHook(() => useNoteAutosave(options));
  act(() => first.result.current.updateDraft('first'));
  first.unmount();
  await act(async () => Promise.resolve());
  const second = renderHook(() => useNoteAutosave(options));
  act(() => second.result.current.updateDraft('newer', { immediate: true }));
  await act(async () => resolve({ updatedAt: 'v2' }));
  expect(store.read('space', 'late')?.markdown).toBe('newer');
  expect(second.result.current.getLatestMarkdown()).toBe('newer');
  second.unmount();
});

it('retains failed saves across routes when session storage is unavailable, scoped by space', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const store = createNoteDraftRecovery();
  const onSave = vi.fn().mockRejectedValue(new Error('offline'));
  const options = { noteId: 'offline', draftScope: 'one', recoveryStore: store, remoteMarkdown: 'base', remoteUpdatedAt: 'v1', canWrite: true, onSave };
  const first = renderHook(() => useNoteAutosave(options));
  act(() => first.result.current.updateDraft('unsaved', { immediate: true }));
  first.unmount();
  await act(async () => Promise.resolve());
  const other = renderHook(() => useNoteAutosave({ ...options, draftScope: 'two' }));
  expect(other.result.current.draftMarkdown).toBe('base');
  other.unmount();
  const second = renderHook(() => useNoteAutosave({ ...options, canWrite: false }));
  expect(second.result.current.draftMarkdown).toBe('unsaved');
  await act(async () => second.result.current.saveNow());
  expect(onSave).toHaveBeenCalledTimes(1);
  second.unmount();
});

it('clears recovery only after a successful save and keeps the original expectedUpdatedAt on retry', async () => {
  const store = createNoteDraftRecovery();
  store.write('s', 'retry', { markdown: 'draft', baseMarkdown: 'base', baseUpdatedAt: 'v1' });
  const onSave = vi.fn().mockResolvedValue({ rawMarkdown: 'draft', updatedAt: 'v2' });
  const hook = renderHook(() => useNoteAutosave({ noteId: 'retry', draftScope: 's', recoveryStore: store, remoteMarkdown: 'base', remoteUpdatedAt: 'v1', canWrite: true, onSave }));
  await act(async () => hook.result.current.saveNow());
  expect(onSave).toHaveBeenCalledWith('retry', 'draft', 'v1');
  expect(store.read('s', 'retry')).toBeUndefined();
  expect(createNoteDraftRecovery().read('s', 'retry')).toBeUndefined();
  hook.unmount();
});
