// V4-06 App
//
// 应用入口：根据当前 pathname 渲染 HomeView / LibraryView / PlaceholderView / ComponentShowcase。
// 1. AppShell 提供 layout + ModuleRail + StatusBar + MobileTabs；
// 2. SearchCommand 由 ⌘/Ctrl K 唤起；
// 3. 全局快捷键 ⌘/Ctrl + / 回主页，⌘/Ctrl + Shift + ↑/↓ 切换工作域；
// 4. HomeView 与 LibraryView 在 /、/materials 路由加载数据；/showcase 路由始终直接展示组件展台（不发 API 请求）。

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from './router';
import { useAppStore, useAppStoreApi } from '../store/AppStoreProvider';
import { AppShell } from '../shell/AppShell';
import { SearchCommand, type SearchHit } from '../shell/SearchCommand';
import { useGlobalShortcuts } from '../shell/useGlobalShortcuts';
import { HomeView } from '../views/HomeView';
import { PlaceholderView } from '../views/PlaceholderView';
import { LibraryView } from '../features/library';
import { PRIMARY_DOMAINS, UTILITY_ITEMS } from '../shell/ModuleRail';
import { LoadingState } from '../components/ui/status';
import { WORK_DOMAINS, type WorkDomain } from '../store/types';
import styles from './App.module.css';

const ComponentShowcase = lazy(async () => {
  const module = await import('../components/ui/showcase');
  return { default: module.ComponentShowcase };
});

interface DomainDescriptor {
  title: string;
  description: string;
}

const DOMAIN_INFO: Record<WorkDomain, DomainDescriptor> = {
  materials: {
    title: '资料工作区',
    description: '按目录组织 Markdown 笔记，用标签串联主题。'
  },
  knowledge: {
    title: '知识库',
    description: '知识单元与学习目标管理（V4-08 接入）。'
  },
  training: {
    title: '试题库',
    description: '题目库与考试场景（V4-08 接入）。'
  },
  learning: {
    title: '执行',
    description: '待办、打卡与习惯追踪（V4-08 接入）。'
  },
  profile: {
    title: '我的',
    description: '工作区与个人设置。'
  }
};

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeDomain = useAppStore((state) => state.navigation.activeWorkDomain);
  const setActiveWorkDomain = useAppStore((state) => state.setActiveWorkDomain);
  const loadWorkspace = useAppStore((state) => state.loadWorkspace);
  const retryWorkspace = useAppStore((state) => state.retryWorkspace);
  const canWriteWorkspace = useAppStore((state) => state.canWriteWorkspace);
  const dataMode = useAppStore((state) => state.dataMode);
  const workspaceError = useAppStore((state) => state.workspaceError);
  const storeApi = useAppStoreApi();

  const [searchOpen, setSearchOpen] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const previousPathRef = useRef(location.pathname);

  // 主页和资料索引共享 workspace 加载；组件展台与门禁页不触发请求。
  useEffect(() => {
    if (location.pathname !== '/' && location.pathname !== '/materials') return;
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
    if (routeDomain !== activeDomain) setActiveWorkDomain(routeDomain);
  }, [activeDomain, location.pathname, setActiveWorkDomain]);

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

  // SearchCommand 数据源
  const searchHits = useSearchHits({
    onSelect: (label) => {
      navigate('/materials');
      setLiveAnnouncement(`${label}已选中`);
    }
  });

  function handleSelectDomain(domain: WorkDomain) {
    const available = [...PRIMARY_DOMAINS, ...UTILITY_ITEMS].find((item) => item.id === domain)?.available ?? false;
    if (!available) {
      setLiveAnnouncement(`${DOMAIN_INFO[domain].title} 尚未上线`);
      return;
    }
    setActiveWorkDomain(domain);
    navigate(domain === 'materials' ? '/materials' : `/${domain}`);
    setLiveAnnouncement(`已切换到 ${DOMAIN_INFO[domain].title}`);
  }

  function handleOpenCreate() {
    if (location.pathname !== '/materials') {
      handleSelectDomain('materials');
      setLiveAnnouncement('已打开资料索引，请在页面中新建笔记');
      return;
    }
    setLiveAnnouncement('请使用资料索引中的新建笔记按钮');
  }

  const routeDomain = useMemo<WorkDomain>(() => {
    const path = location.pathname.replace(/^\//, '').split('/')[0];
    if (!path || path === 'materials') return 'materials';
    if (WORK_DOMAINS.includes(path as WorkDomain)) return path as WorkDomain;
    if (path === 'showcase') return activeDomain;
    return activeDomain;
  }, [location.pathname, activeDomain]);

  const currentDomainInfo = DOMAIN_INFO[routeDomain];
  const canWrite = canWriteWorkspace();
  const isShowcaseActive = location.pathname === '/showcase';

  function handleOpenShowcase() {
    navigate('/showcase');
    setLiveAnnouncement('已打开组件展台');
  }

  return (
    <AppShell
      activeDomain={isShowcaseActive || location.pathname === '/' ? null : routeDomain}
      onSelectDomain={handleSelectDomain}
      onReturnHome={handleReturnHome}
      onOpenSearch={() => setSearchOpen(true)}
      onOpenCreate={handleOpenCreate}
      onOpenShowcase={handleOpenShowcase}
      isShowcaseActive={isShowcaseActive}
      statusbar={{
        contextLabel: location.pathname === '/materials' ? '资料索引' : routeDomain === 'materials' ? '主页' : currentDomainInfo.title,
        dataMode,
        dataModeNote: workspaceError && dataMode !== 'api' ? <span>请稍后重试</span> : undefined,
        panels: [
          {
            id: 'sidebar',
            label: '侧栏',
            active: true,
            onToggle: () => setLiveAnnouncement('侧栏入口已保留；页面面板将在后续功能层接入')
          },
          {
            id: 'inspector',
            label: '检查器',
            active: true,
            onToggle: () => setLiveAnnouncement('检查器入口已保留；页面面板将在后续功能层接入')
          },
          {
            id: 'focus',
            label: '专注模式',
            active: false,
            onToggle: () => setLiveAnnouncement('专注模式将在后续功能层接入')
          }
        ]
      }}
      mobileTabs
      liveAnnouncement={liveAnnouncement}
    >
      <div className={styles.route}>
        <Routes
          pathname={location.pathname}
          routeDomain={routeDomain}
          onRetry={retryWorkspace}
          canWrite={canWrite}
          onOpenMaterials={() => handleSelectDomain('materials')}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenCreate={handleOpenCreate}
          onOpenSchedule={() => setLiveAnnouncement('日程将在后续版本接入')}
          onSelectNote={(noteId, title) => {
            storeApi.getState().selectNote(noteId);
            navigate('/materials');
            setLiveAnnouncement(`${title}已选中`);
          }}
          onOpenNote={(note) => setLiveAnnouncement(`${note.title}已选中，编辑器将在 V4-07 接入`)}
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

function Routes({
  pathname,
  routeDomain,
  onRetry,
  canWrite,
  onSelectNote,
  onOpenMaterials,
  onOpenSearch,
  onOpenCreate,
  onOpenSchedule,
  onOpenNote
}: {
  pathname: string;
  routeDomain: WorkDomain;
  onRetry: () => Promise<void>;
  canWrite: boolean;
  onSelectNote(noteId: string, title: string): void;
  onOpenMaterials(): void;
  onOpenSearch(): void;
  onOpenCreate(): void;
  onOpenSchedule(): void;
  onOpenNote(note: import('@study-accelerator/web-core').Note): void;
}) {
  if (pathname === '/showcase') {
    return (
      <Suspense fallback={<LoadingState label="正在加载组件展台…" />}>
        <ComponentShowcase />
      </Suspense>
    );
  }
  if (pathname === '/materials') {
    return <LibraryView onRetry={onRetry} onOpenNote={onOpenNote} />;
  }
  if (routeDomain === 'materials') {
    return (
      <HomeStage
        onRetry={onRetry}
        canWrite={canWrite}
        onSelectNote={onSelectNote}
        onOpenMaterials={onOpenMaterials}
        onOpenSearch={onOpenSearch}
        onOpenCreate={onOpenCreate}
        onOpenSchedule={onOpenSchedule}
      />
    );
  }
  return <PlaceholderStage domain={routeDomain} />;
}

function HomeStage({
  onRetry,
  canWrite,
  onSelectNote,
  onOpenMaterials,
  onOpenSearch,
  onOpenCreate,
  onOpenSchedule
}: {
  onRetry: () => Promise<void>;
  canWrite: boolean;
  onSelectNote(noteId: string, title: string): void;
  onOpenMaterials(): void;
  onOpenSearch(): void;
  onOpenCreate(): void;
  onOpenSchedule(): void;
}) {
  const loadState = useAppStore((s) => s.workspaceLoadState);
  const error = useAppStore((s) => s.workspaceError);
  const dataMode = useAppStore((s) => s.dataMode);
  const serverData = useAppStore((s) => s.serverData);
  return (
    <HomeView
      loadState={loadState}
      error={error}
      dataMode={dataMode}
      notes={serverData.notes}
      folders={Object.values(serverData.foldersById)}
      tags={serverData.tags}
      isWritable={canWrite}
      onRetry={() => void onRetry()}
      onOpenMaterials={onOpenMaterials}
      onOpenSearch={onOpenSearch}
      onOpenCreate={onOpenCreate}
      onOpenSchedule={onOpenSchedule}
      onSelectNote={onSelectNote}
    />
  );
}

function PlaceholderStage({ domain }: { domain: WorkDomain }) {
  const info = DOMAIN_INFO[domain];
  const setActiveWorkDomain = useAppStore((s) => s.setActiveWorkDomain);
  const navigate = useNavigate();
  return (
    <PlaceholderView
      moduleId={domain}
      title={info.title}
      description={info.description}
      onReturnHome={() => {
        setActiveWorkDomain('materials');
        navigate('/');
      }}
    />
  );
}

function useSearchHits({ onSelect }: { onSelect(label: string): void }): SearchHit[] {
  const notes = useAppStore((s) => s.serverData.notes);
  const tags = useAppStore((s) => s.serverData.tags);
  const selectNote = useAppStore((s) => s.selectNote);
  const setActiveWorkDomain = useAppStore((s) => s.setActiveWorkDomain);
  const selectFolder = useAppStore((s) => s.selectFolder);

  return useMemo(() => {
    const hits: SearchHit[] = [];
    hits.push({
      id: 'action:home',
      primary: '返回资料主页',
      secondary: '打开资料工作区概览',
      hint: '跳转',
      group: '动作',
      onSelect: () => {
        setActiveWorkDomain('materials');
        onSelect('资料主页');
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
          if (note.folderId) selectFolder(note.folderId);
          selectNote(note.id);
          onSelect(`资料“${note.title || '无标题'}”`);
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
          onSelect(`标签“${tag.name}”`);
        }
      });
    }
    return hits;
  }, [notes, tags, selectNote, setActiveWorkDomain, selectFolder, onSelect]);
}

export function AppRoot() {
  return <App />;
}
