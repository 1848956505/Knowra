import { registerDesktopSave } from '../../app/desktopLifecycle';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiRequestError } from '@study-accelerator/web-core';
import { noteDraftRecovery, type RecoveredNoteDraft } from './noteDraftRecovery';

const DEFAULT_AUTOSAVE_DELAY_MS = 700;
const DEFAULT_DRAFT_RENDER_DELAY_MS = 80;
const NOTE_UPDATE_CONFLICT = 'NOTE_UPDATE_CONFLICT';

interface DraftState {
  noteId: string;
  markdown: string;
}
export interface NoteAutosaveSaveResult {
  rawMarkdown?: string;
  updatedAt?: string;
}
export interface UseNoteAutosaveOptions {
  noteId: string;
  draftScope?: string;
  recoveryStore?: typeof noteDraftRecovery;
  remoteMarkdown: string;
  remoteUpdatedAt?: string;
  canWrite: boolean;
  delayMs?: number;
  renderDelayMs?: number;
  onSave(
    noteId: string,
    markdown: string,
    expectedUpdatedAt?: string
  ): Promise<NoteAutosaveSaveResult | void>;
}

export interface NoteAutosaveController {
  draftMarkdown: string;
  hasLocalChanges: boolean;
  hasConflict: boolean;
  saveError: string | null;
  updateDraft(markdown: string, options?: { immediate?: boolean }): void;
  saveNow(markdown?: string): Promise<void>;
  getLatestMarkdown(): string;
  discardRecoveredDraft(): void;
}
/**
 * 每篇笔记分别保存远端基线、本地修订号和待写入草稿。
 * 所有写入都携带首次产生草稿时的 updatedAt；若后端报告冲突，自动保存暂停，
 * 本地草稿通过恢复存储跨路由保留，绝不以 replaceAll 或无条件 PATCH 覆盖远端版本。
 */
export function useNoteAutosave({
  noteId,
  draftScope,
  recoveryStore = noteDraftRecovery,
  remoteMarkdown,
  remoteUpdatedAt,
  canWrite,
  delayMs = DEFAULT_AUTOSAVE_DELAY_MS,
  renderDelayMs = DEFAULT_DRAFT_RENDER_DELAY_MS,
  onSave
}: UseNoteAutosaveOptions): NoteAutosaveController {
  const [draft, setDraft] = useState<DraftState>({ noteId, markdown: remoteMarkdown });
  const [, publishStateChange] = useReducer((version: number) => version + 1, 0);
  const currentNoteIdRef = useRef(noteId);
  const draftByNoteRef = useRef(new Map<string, string>([[noteId, remoteMarkdown]]));
  const pendingByNoteRef = useRef(new Map<string, string>());
  const timerByNoteRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const renderTimerByNoteRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlightByNoteRef = useRef(new Map<string, Promise<void>>());
  const serverMarkdownByNoteRef = useRef(new Map<string, string>([[noteId, remoteMarkdown]]));
  const baseUpdatedAtByNoteRef = useRef(new Map<string, string | undefined>([[noteId, remoteUpdatedAt]]));
  const localRevisionByNoteRef = useRef(new Map<string, number>([[noteId, 0]]));
  const syncedRevisionByNoteRef = useRef(new Map<string, number>([[noteId, 0]]));
  const conflictByNoteRef = useRef(new Map<string, string>());
  const errorByNoteRef = useRef(new Map<string, string>());
  const recoveryByNoteRef = useRef(new Map<string, { scope: string; draft: RecoveredNoteDraft }>());
  const restoredByNoteRef = useRef(new Set<string>());
  const retainDraft = useCallback((targetNoteId: string, markdown: string, scope?: string) => {
    const owned = recoveryByNoteRef.current.get(targetNoteId);
    const targetScope = scope ?? owned?.scope;
    if (targetScope === undefined) return;
    // An earlier unmounted editor must not replace a newer editor's recovery record.
    if (owned && recoveryStore.read(targetScope, targetNoteId) !== owned.draft) return;
    const next = {
      markdown,
      baseMarkdown: serverMarkdownByNoteRef.current.get(targetNoteId) ?? '',
      baseUpdatedAt: baseUpdatedAtByNoteRef.current.get(targetNoteId),
      conflict: conflictByNoteRef.current.get(targetNoteId)
    };
    recoveryStore.write(targetScope, targetNoteId, next);
    recoveryByNoteRef.current.set(targetNoteId, { scope: targetScope, draft: next });
  }, [recoveryStore]);
  const clearRecovery = useCallback((targetNoteId: string) => {
    const owned = recoveryByNoteRef.current.get(targetNoteId);
    if (owned) recoveryStore.remove(owned.scope, targetNoteId, owned.draft);
    recoveryByNoteRef.current.delete(targetNoteId);
  }, [recoveryStore]);
  const onSaveRef = useRef(onSave);
  const canWriteRef = useRef(canWrite);
  onSaveRef.current = onSave;
  canWriteRef.current = canWrite;
  currentNoteIdRef.current = noteId;
  const publishFor = useCallback((targetNoteId: string) => {
    if (currentNoteIdRef.current === targetNoteId) publishStateChange();
  }, []);
  const setCurrentDraft = useCallback((next: DraftState) => {
    const renderTimer = renderTimerByNoteRef.current.get(next.noteId);
    if (renderTimer) clearTimeout(renderTimer);
    renderTimerByNoteRef.current.delete(next.noteId);
    draftByNoteRef.current.set(next.noteId, next.markdown);
    setDraft(next);
  }, []);
  const scheduleCurrentDraft = useCallback((next: DraftState, immediate = false) => {
    draftByNoteRef.current.set(next.noteId, next.markdown);
    const previousTimer = renderTimerByNoteRef.current.get(next.noteId);
    if (previousTimer) clearTimeout(previousTimer);
    if (immediate || renderDelayMs <= 0) {
      renderTimerByNoteRef.current.delete(next.noteId);
      if (currentNoteIdRef.current === next.noteId) setDraft(next);
      return;
    }
    const timer = setTimeout(() => {
      renderTimerByNoteRef.current.delete(next.noteId);
      if (currentNoteIdRef.current !== next.noteId) return;
      setDraft({
        noteId: next.noteId,
        markdown: draftByNoteRef.current.get(next.noteId) ?? next.markdown
      });
    }, renderDelayMs);
    renderTimerByNoteRef.current.set(next.noteId, timer);
  }, [renderDelayMs]);
  const persist = useCallback(async (targetNoteId: string, markdown: string) => {
    if (!canWriteRef.current) return;
    const previous = inFlightByNoteRef.current.get(targetNoteId) ?? Promise.resolve();
    const request = previous
      .catch(() => undefined)
      .then(async () => {
        const conflictMessage = conflictByNoteRef.current.get(targetNoteId);
        if (conflictMessage) throw new Error(conflictMessage);
        const expectedUpdatedAt = baseUpdatedAtByNoteRef.current.get(targetNoteId);
        const revision = localRevisionByNoteRef.current.get(targetNoteId) ?? 0;
        try {
          const saved = await onSaveRef.current(targetNoteId, markdown, expectedUpdatedAt);
          const savedMarkdown = saved?.rawMarkdown ?? markdown;
          serverMarkdownByNoteRef.current.set(targetNoteId, savedMarkdown);
          baseUpdatedAtByNoteRef.current.set(targetNoteId, saved?.updatedAt ?? expectedUpdatedAt);
          syncedRevisionByNoteRef.current.set(targetNoteId, revision);
          errorByNoteRef.current.delete(targetNoteId);
          const latest = draftByNoteRef.current.get(targetNoteId) ?? markdown;
          if (latest === markdown) clearRecovery(targetNoteId);
          else retainDraft(targetNoteId, latest);
          if (pendingByNoteRef.current.get(targetNoteId) === markdown) {
            pendingByNoteRef.current.delete(targetNoteId);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '正文保存失败';
          errorByNoteRef.current.set(targetNoteId, message);
          if (isUpdateConflict(error)) conflictByNoteRef.current.set(targetNoteId, message);
          retainDraft(targetNoteId, draftByNoteRef.current.get(targetNoteId) ?? markdown);
          if (!pendingByNoteRef.current.has(targetNoteId)) {
            pendingByNoteRef.current.set(targetNoteId, markdown);
          }
          throw error;
        } finally {
          publishFor(targetNoteId);
        }
      });
    inFlightByNoteRef.current.set(targetNoteId, request);
    publishFor(targetNoteId);
    try {
      await request;
    } finally {
      if (inFlightByNoteRef.current.get(targetNoteId) === request) {
        inFlightByNoteRef.current.delete(targetNoteId);
        publishFor(targetNoteId);
      }
    }
  }, [clearRecovery, publishFor, retainDraft]);
  const flushNote = useCallback(async (targetNoteId: string, fallback?: string) => {
    const timer = timerByNoteRef.current.get(targetNoteId);
    if (timer) clearTimeout(timer);
    timerByNoteRef.current.delete(targetNoteId);
    const markdown = pendingByNoteRef.current.get(targetNoteId) ?? fallback;
    if (markdown === undefined || !canWriteRef.current) return;
    const serverMarkdown = serverMarkdownByNoteRef.current.get(targetNoteId);
    if (!inFlightByNoteRef.current.has(targetNoteId) && markdown === serverMarkdown) {
      pendingByNoteRef.current.delete(targetNoteId);
      clearRecovery(targetNoteId);
      syncedRevisionByNoteRef.current.set(
        targetNoteId,
        localRevisionByNoteRef.current.get(targetNoteId) ?? 0
      );
      publishFor(targetNoteId);
      return;
    }
    await persist(targetNoteId, markdown);
  }, [clearRecovery, persist, publishFor]);
  const updateDraft = useCallback((markdown: string, options?: { immediate?: boolean }) => {
    scheduleCurrentDraft({ noteId, markdown }, options?.immediate);
    if (!canWriteRef.current) return;
    localRevisionByNoteRef.current.set(noteId, (localRevisionByNoteRef.current.get(noteId) ?? 0) + 1);
    pendingByNoteRef.current.set(noteId, markdown);
    retainDraft(noteId, markdown, draftScope);
    errorByNoteRef.current.delete(noteId);
    const previousTimer = timerByNoteRef.current.get(noteId);
    if (previousTimer) clearTimeout(previousTimer);
    if (!conflictByNoteRef.current.has(noteId)) {
      const timer = setTimeout(() => {
        timerByNoteRef.current.delete(noteId);
        void flushNote(noteId).catch(() => undefined);
      }, delayMs);
      timerByNoteRef.current.set(noteId, timer);
    }
  }, [delayMs, draftScope, flushNote, noteId, retainDraft, scheduleCurrentDraft]);
  const saveNow = useCallback(async (markdown?: string) => {
    const latest = markdown ?? draftByNoteRef.current.get(noteId) ?? remoteMarkdown;
    draftByNoteRef.current.set(noteId, latest);
    if (latest !== serverMarkdownByNoteRef.current.get(noteId)) {
      pendingByNoteRef.current.set(noteId, latest);
      retainDraft(noteId, latest, draftScope);
    }
    await flushNote(noteId, latest);
  }, [draftScope, flushNote, noteId, remoteMarkdown, retainDraft]);
  useEffect(() => {
    if (draftScope !== undefined && !restoredByNoteRef.current.has(noteId)) {
      restoredByNoteRef.current.add(noteId);
      const recovered = recoveryStore.read(draftScope, noteId);
      if (recovered) {
        recoveryByNoteRef.current.set(noteId, { scope: draftScope, draft: recovered });
        serverMarkdownByNoteRef.current.set(noteId, recovered.baseMarkdown);
        baseUpdatedAtByNoteRef.current.set(noteId, recovered.baseUpdatedAt);
        pendingByNoteRef.current.set(noteId, recovered.markdown);
        localRevisionByNoteRef.current.set(noteId, 1);
        syncedRevisionByNoteRef.current.set(noteId, 0);
        if (recovered.conflict || recovered.baseUpdatedAt !== remoteUpdatedAt || recovered.baseMarkdown !== remoteMarkdown) {
          const message = recovered.conflict ?? '远端正文已更新，已恢复本地草稿，请导出草稿后核对。';
          conflictByNoteRef.current.set(noteId, message);
          errorByNoteRef.current.set(noteId, message);
        }
        setCurrentDraft({ noteId, markdown: recovered.markdown });
        return;
      }
    }
    const knownNote = serverMarkdownByNoteRef.current.has(noteId);
    if (!knownNote) {
      serverMarkdownByNoteRef.current.set(noteId, remoteMarkdown);
      baseUpdatedAtByNoteRef.current.set(noteId, remoteUpdatedAt);
      localRevisionByNoteRef.current.set(noteId, 0);
      syncedRevisionByNoteRef.current.set(noteId, 0);
      setCurrentDraft({ noteId, markdown: remoteMarkdown });
      return;
    }
    const hasLocalWork = noteHasLocalWork(noteId, {
      pending: pendingByNoteRef.current,
      inFlight: inFlightByNoteRef.current,
      conflicts: conflictByNoteRef.current,
      localRevisions: localRevisionByNoteRef.current,
      syncedRevisions: syncedRevisionByNoteRef.current
    });
    if (!hasLocalWork) {
      serverMarkdownByNoteRef.current.set(noteId, remoteMarkdown);
      baseUpdatedAtByNoteRef.current.set(noteId, remoteUpdatedAt);
      if (draft.noteId !== noteId || draft.markdown !== remoteMarkdown) {
        setCurrentDraft({ noteId, markdown: remoteMarkdown });
      }
      return;
    }
    const localDraft = draftByNoteRef.current.get(noteId) ?? remoteMarkdown;
    if (draft.noteId !== noteId || draft.markdown !== localDraft) {
      setCurrentDraft({ noteId, markdown: localDraft });
    }
  }, [draft.markdown, draft.noteId, draftScope, noteId, recoveryStore, remoteMarkdown, remoteUpdatedAt, setCurrentDraft]);
  useEffect(() => () => {
    const renderTimer = renderTimerByNoteRef.current.get(noteId);
    if (renderTimer) clearTimeout(renderTimer);
    renderTimerByNoteRef.current.delete(noteId);
    const timer = timerByNoteRef.current.get(noteId);
    if (timer) clearTimeout(timer);
    timerByNoteRef.current.delete(noteId);
    const pending = pendingByNoteRef.current.get(noteId);
    if (pending !== undefined && canWriteRef.current && !conflictByNoteRef.current.has(noteId)) {
      void persist(noteId, pending).catch(() => undefined);
    }
  }, [noteId, persist]);
  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingByNoteRef.current.size === 0 && inFlightByNoteRef.current.size === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);
  useEffect(() => {
    if (!window.knowraDesktop) return;
    const flushAll = async () => {
      await Promise.all([...inFlightByNoteRef.current.values()]);
      // 旧编辑器卸载后，重新打开的编辑器可能已经保存或处理了恢复草稿。
      for (const [id, owned] of recoveryByNoteRef.current) {
        if (recoveryStore.read(owned.scope, id) !== owned.draft) {
          pendingByNoteRef.current.delete(id);
          conflictByNoteRef.current.delete(id);
          errorByNoteRef.current.delete(id);
        }
      }
      if (!canWriteRef.current && pendingByNoteRef.current.size) throw new Error('当前正文尚未保存，请先处理只读或加载状态。');
      for (const id of [...pendingByNoteRef.current.keys()]) await flushNote(id);
      if (conflictByNoteRef.current.size) throw new Error('正文有未解决的保存冲突，请处理后退出。');
    };
    const remove = registerDesktopSave(flushAll);
    return () => {
      // 切换路由后仍保留失败草稿的退出保护，成功落盘才注销。
      void flushAll().then(remove).catch(() => undefined);
    };
  }, [flushNote, recoveryStore]);
  const hasLocalChanges = noteHasLocalWork(noteId, {
    pending: pendingByNoteRef.current,
    inFlight: inFlightByNoteRef.current,
    conflicts: conflictByNoteRef.current,
    localRevisions: localRevisionByNoteRef.current,
    syncedRevisions: syncedRevisionByNoteRef.current
  });
  const localDraft = draft.noteId === noteId
    ? draft.markdown
    : draftByNoteRef.current.get(noteId) ?? remoteMarkdown;
  return {
    draftMarkdown: hasLocalChanges ? localDraft : remoteMarkdown,
    hasLocalChanges,
    hasConflict: conflictByNoteRef.current.has(noteId),
    saveError: errorByNoteRef.current.get(noteId) ?? null,
    updateDraft,
    saveNow,
    discardRecoveredDraft: () => {
      const timer = timerByNoteRef.current.get(noteId);
      if (timer) clearTimeout(timer);
      timerByNoteRef.current.delete(noteId);
      pendingByNoteRef.current.delete(noteId);
      clearRecovery(noteId);
      conflictByNoteRef.current.delete(noteId);
      errorByNoteRef.current.delete(noteId);
      syncedRevisionByNoteRef.current.set(noteId, localRevisionByNoteRef.current.get(noteId) ?? 0);
      serverMarkdownByNoteRef.current.set(noteId, remoteMarkdown);
      baseUpdatedAtByNoteRef.current.set(noteId, remoteUpdatedAt);
      setCurrentDraft({ noteId, markdown: remoteMarkdown });
    },
    getLatestMarkdown: () => draftByNoteRef.current.get(noteId) ?? remoteMarkdown
  };
}
interface LocalWorkMaps {
  pending: Map<string, string>;
  inFlight: Map<string, Promise<void>>;
  conflicts: Map<string, string>;
  localRevisions: Map<string, number>;
  syncedRevisions: Map<string, number>;
}

function noteHasLocalWork(noteId: string, maps: LocalWorkMaps): boolean {
  return maps.pending.has(noteId)
    || maps.inFlight.has(noteId)
    || maps.conflicts.has(noteId)
    || (maps.localRevisions.get(noteId) ?? 0) !== (maps.syncedRevisions.get(noteId) ?? 0);
}

function isUpdateConflict(error: unknown): boolean {
  return error instanceof ApiRequestError
    ? error.code === NOTE_UPDATE_CONFLICT || error.status === 409
    : typeof error === 'object' && error !== null
      && (('code' in error && error.code === NOTE_UPDATE_CONFLICT)
        || ('status' in error && error.status === 409));
}
