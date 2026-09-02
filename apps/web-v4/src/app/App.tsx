// V4-05 App
//
// 应用入口：根据当前 pathname 渲染 HomeView / PlaceholderView / ComponentShowcase。
// 1. AppShell 提供 layout + ModuleRail + StatusBar + MobileTabs；
// 2. SearchCommand 由 ⌘/Ctrl K 唤起；
// 3. 全局快捷键 ⌘/Ctrl + / 回主页，⌘/Ctrl + Shift + ↑/↓ 切换工作域；
// 4. HomeView 在 / 路由加载数据；/showcase 路由始终直接展示组件展台（不发 API 请求）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from './router';
import { useAppStore, useAppStoreApi } from '../store/AppStoreProvider';
import { AppShell } from '../shell/AppShell';
import { deriveStatusPath } from '../shell/statusPath';
import { SearchCommand, type SearchHit } from '../shell/SearchCommand';
import { useGlobalShortcuts } from '../shell/useGlobalShortcuts';
import { NotesContextSidebar } from '../features/notes';
import { getEditorNoteId } from '../features/editor/editorRoute';
import {
  applyEditorViewAction,
  describeEditorViewAction,
  getEffectiveEditorViewState,
  initialEditorViewState,
  type EditorViewAction
} from '../features/editor/editorViewState';
import { PRIMARY_DOMAINS, UTILITY_ITEMS } from '../shell/ModuleRail';
import { WORK_DOMAINS, type WorkDomain } from '../store/types';
import { AppRoutes, DOMAIN_INFO } from './AppRoutes';
import styles from './App.module.css';

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const storeActiveDomain = useAppStore((state) => state.navigation.activeWorkDomain);
  const setActiveWorkDomain = useAppStore((state) => state.setActiveWorkDomain);
  const loadWorkspace = useAppStore((state) => state.loadWorkspace);
  const retryWorkspace = useAppStore((state) => state.retryWorkspace);
  const canWriteWorkspace = useAppStore((state) => state.canWriteWorkspace);
  const dataMode = useAppStore((state) => state.dataMode);
  const saveState = useAppStore((state) => state.saveState);
  const workspaceError = useAppStore((state) => state.workspaceError);
  const notes = useAppStore((state) => state.serverData.notes);
  const storeApi = useAppStoreApi();

  const [searchOpen, setSearchOpen] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [editorView, setEditorView] = useState(initialEditorViewState);
  const previousPathRef = useRef(location.pathname);

  // 仅在 / 路由（非 /showcase）触发 workspace 加载。
  useEffect(() => {
    if (location.pathname !== '/' && !location.pathname.startsWith('/materials')) return;
    void loadWorkspace();
  }, [loadWorkspace, location.pathname]);

  // URL 是工作域真源：支持可分享链接、前进后退和未上线模块的真实门禁页。
  useEffect(() => {
    if (location.pathname === '/showcase') return;
    const segment = location.pathname.replace(/^\//, '').split('/')[0];
    const routeDomain: WorkDomain = !segment || segment === 'materials'
      ? 'materials'
      : WORK_DOMAINS.includes(segment as WorkDomain)
        ? segment as WorkDomain
        : 'materials';
    if (routeDomain !== storeActiveDomain) setActiveWorkDomain(routeDomain);
  }, [storeActiveDomain, location.pathname, setActiveWorkDomain]);

  useEffect(() => {
    if (previousPathRef.current === location.pathname) return;
    previousPathRef.current = location.pathname;
    const stage = document.getElementById('feature-stage');
    stage?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    stage?.focus({ preventScroll: true });
  }, [location.pathname]);

  function handleReturnHome() {
    setActiveWorkDomain('materials');
    navigate('/');
    setLiveAnnouncement('已返回主页');
  }

  // 全局快捷键
  useGlobalShortcuts({
    onOpenSearch: () => setSearchOpen(true),
    onReturnHome: () => {
      setActiveWorkDomain('materials');
      navigate('/');
      setLiveAnnouncement('已返回主页');
    },
    onCycleDomain: (direction) => {
      const availableDomains = [...PRIMARY_DOMAINS, ...UTILITY_ITEMS]
        .filter((item) => item.available)
        .map((item) => item.id);
      const current = storeApi.getState().navigation.activeWorkDomain;
      const currentIndex = Math.max(0, availableDomains.indexOf(current));
      const nextIndex = (currentIndex + direction + availableDomains.length) % availableDomains.length;
      const nextDomain = availableDomains[nextIndex];
      if (!nextDomain || nextDomain === current) {
        setLiveAnnouncement('当前只有资料工作域可用');
        return;
      }
      setActiveWorkDomain(nextDomain);
      navigate(`/${nextDomain}`);
      setLiveAnnouncement(`已切换到 ${DOMAIN_INFO[nextDomain].title}`);
    }
  });

  // SearchCommand 数据源：每个命中项决定自己的目标路径。
  // - 动作（action:home）→ 主页（/）；
  // - 笔记 → 编辑页；标签 → 笔记索引页，由 useSearchHits 同步索引筛选与选中项。
  const searchHits = useSearchHits({
    onSelect: (announcement, path) => {
      navigate(path);
      setLiveAnnouncement(announcement);
    }
  });

  function handleSelectDomain(domain: WorkDomain) {
    const available = [...PRIMARY_DOMAINS, ...UTILITY_ITEMS].find((item) => item.id === domain)?.available ?? false;
    if (!available) {
      setLiveAnnouncement(`${DOMAIN_INFO[domain].title} 尚未上线`);
      return;
    }
    setActiveWorkDomain(domain);
    // 每个工作域都有独立路由：资料 → /materials，知识 → /knowledge ……
    // 主页（/）只由左上角 Logo 与全局快捷键 ⌘/ 进入，
    // 不再由"资料"按钮带回，避免主页入口语义重叠。
    navigate(`/${domain}`);
    setLiveAnnouncement(`已切换到 ${DOMAIN_INFO[domain].title}`);
  }

  const routeDomain = useMemo<WorkDomain>(() => {
    const path = location.pathname.replace(/^\//, '').split('/')[0];
    if (!path || path === 'materials') return 'materials';
    if (WORK_DOMAINS.includes(path as WorkDomain)) return path as WorkDomain;
    if (path === 'showcase') return storeActiveDomain;
    return storeActiveDomain;
  }, [location.pathname, storeActiveDomain]);

  const canWrite = canWriteWorkspace();
  const isShowcaseActive = location.pathname === '/showcase';
  const isHome = location.pathname === '/';
  const isNotesIndex = location.pathname === '/materials';
  const editorNoteId = getEditorNoteId(location.pathname);
  const isNoteEditor = editorNoteId !== null;
  const effectiveEditorView = useMemo(() => getEffectiveEditorViewState(editorView), [editorView]);
  const editorNote = editorNoteId ? notes.find((note) => note.id === editorNoteId) ?? null : null;
  // 主页（/）不属于任何工作域的子页面：左轨不应高亮任何模块入口；
  // 笔记索引页（/materials）才是"资料"工作域的着陆页。
  const activeDomain: WorkDomain | null =
    isShowcaseActive || isHome ? null : routeDomain;

  // StatusBar 位置路径只描述当前路由 surface，不读取后台 selection。
  const statusPath = deriveStatusPath({
    pathname: location.pathname,
    routeDomain,
    onNavigateHome: () => navigate('/'),
    onNavigateMaterials: () => navigate('/materials'),
    noteTitle: editorNote?.title
  });

  function openNote(noteId: string) {
    storeApi.getState().selectNote(noteId);
    navigate(`/materials/notes/${encodeURIComponent(noteId)}`);
    const title = storeApi.getState().serverData.notes.find((note) => note.id === noteId)?.title || '无标题笔记';
    setLiveAnnouncement(`已打开笔记：${title}`);
  }

  function openNotesIndex() {
    navigate('/materials');
    setLiveAnnouncement('已打开笔记索引');
  }

  function handleOpenShowcase() {
    navigate('/showcase');
    setLiveAnnouncement('已打开组件展台');
  }

  function handleEditorViewAction(action: EditorViewAction) {
    if (!isNoteEditor) {
      setLiveAnnouncement('视图功能仅在笔记编辑页面可用');
      return;
    }
    setLiveAnnouncement(describeEditorViewAction(effectiveEditorView, action));
    setEditorView((current) => applyEditorViewAction(current, action));
  }

  const showNotesContextSidebar = isNotesIndex || (isNoteEditor && effectiveEditorView.showLeftSidebar);

  return (
    <AppShell
      activeDomain={activeDomain}
      contextSidebar={showNotesContextSidebar ? (
        <NotesContextSidebar onOpenNote={openNote} onOpenIndex={openNotesIndex} />
      ) : undefined}
      stageMode={isNoteEditor ? 'workspace' : 'default'}
      focusMode={isNoteEditor && effectiveEditorView.mode === 'focus'}
      onSelectDomain={handleSelectDomain}
      onReturnHome={handleReturnHome}
      onOpenSearch={() => setSearchOpen(true)}
      onOpenCreate={() => setLiveAnnouncement('新建笔记将在 V4-06 接入')}
      onOpenShowcase={handleOpenShowcase}
      isShowcaseActive={isShowcaseActive}
      statusbar={{
        path: statusPath,
        saveState,
        savedAt: editorNote?.updatedAt,
        dataMode,
        dataModeNote: workspaceError && dataMode !== 'api' ? <span>请稍后重试</span> : undefined,
        panels: [
          {
            id: 'sidebar',
            label: '侧栏',
            active: isNotesIndex || (isNoteEditor && effectiveEditorView.showLeftSidebar),
            onToggle: () => {
              if (!isNoteEditor) {
                setLiveAnnouncement('侧栏仅在笔记编辑页面可切换');
                return;
              }
              handleEditorViewAction('toggle-left-sidebar');
            }
          },
          {
            id: 'inspector',
            label: '检查器',
            active: isNoteEditor && effectiveEditorView.showRightSidebar,
            onToggle: () => {
              if (!isNoteEditor) {
                setLiveAnnouncement('检查器仅在笔记编辑页面可用');
                return;
              }
              handleEditorViewAction('toggle-right-sidebar');
            }
          },
          {
            id: 'focus',
            label: '专注模式',
            active: isNoteEditor && effectiveEditorView.mode === 'focus',
            onToggle: () => {
              if (!isNoteEditor) {
                setLiveAnnouncement('专注模式仅在笔记编辑页面可用');
                return;
              }
              handleEditorViewAction('toggle-focus');
            }
          }
        ]
      }}
      mobileTabs
      liveAnnouncement={liveAnnouncement}
    >
      <div className={`${styles.route} ${isNoteEditor ? styles.routeWorkspace : ''}`}>
        <AppRoutes
          pathname={location.pathname}
          routeDomain={routeDomain}
          onRetry={retryWorkspace}
          canWrite={canWrite}
          onOpenMaterials={() => navigate('/materials')}
          statusPath={statusPath}
          editorNoteId={editorNoteId}
          editorView={effectiveEditorView}
          onEditorViewAction={handleEditorViewAction}
          onOpenNote={openNote}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenCreate={() => setLiveAnnouncement('新建笔记将在 V4-06 接入')}
          onOpenSchedule={() => setLiveAnnouncement('日程将在后续版本接入')}
          onSelectNote={(noteId) => openNote(noteId)}
        />
      </div>
      <SearchCommand
        isOpen={searchOpen}
        onOpenChange={setSearchOpen}
        hits={searchHits}
      />
    </AppShell>
  );
}

function useSearchHits({
  onSelect
}: {
  /** 由每个命中项决定目标路径与宣告文案；调用方负责 navigate + setLiveAnnouncement。 */
  onSelect(announcement: string, path: string): void;
}): SearchHit[] {
  const notes = useAppStore((s) => s.serverData.notes);
  const tags = useAppStore((s) => s.serverData.tags);
  const selectNote = useAppStore((s) => s.selectNote);
  const setActiveWorkDomain = useAppStore((s) => s.setActiveWorkDomain);
  const selectNotesFolder = useAppStore((s) => s.selectNotesFolder);
  const selectNotesTag = useAppStore((s) => s.selectNotesTag);

  return useMemo(() => {
    const hits: SearchHit[] = [];
    hits.push({
      id: 'action:home',
      primary: '返回主页',
      secondary: '回到早安页',
      hint: '跳转',
      group: '动作',
      onSelect: () => {
        // 主页（/）由左上角 Logo 与全局快捷键 ⌘/ 触达；
        // 这里保留 SearchCommand 里的"动作"入口，文案与跳转路径必须和 logo 一致。
        onSelect('已返回主页', '/');
      }
    });
    for (const note of notes) {
      if (note.deleted) continue;
      hits.push({
        id: `note:${note.id}`,
        primary: note.title || '（无标题）',
        secondary: note.folderId ? `目录 ${note.folderId}` : '未分类',
        hint: '资料',
        group: '资料',
        onSelect: () => {
          setActiveWorkDomain('materials');
          selectNotesFolder(note.folderId);
          selectNote(note.id);
          onSelect(
            `已打开笔记“${note.title || '无标题'}”`,
            `/materials/notes/${encodeURIComponent(note.id)}`
          );
        }
      });
    }
    for (const tag of tags) {
      if (!tag.name) continue;
      hits.push({
        id: `tag:${tag.id}`,
        primary: `#${tag.name}`,
        secondary: '按标签筛选',
        hint: '标签',
        group: '标签',
        onSelect: () => {
          setActiveWorkDomain('materials');
          selectNotesTag(tag.id);
          onSelect(`已按标签“${tag.name}”筛选笔记`, '/materials');
        }
      });
    }
    return hits;
  }, [notes, tags, selectNote, setActiveWorkDomain, selectNotesFolder, selectNotesTag, onSelect]);
}

export function AppRoot() {
  return <App />;
}
