import type { WorkDomain } from '../store/types';
import type { PathSegment } from './StatusBar';

export interface StatusPathInput {
  pathname: string;
  routeDomain: WorkDomain;
  onNavigateHome(): void;
  onNavigateMaterials(): void;
}

/**
 * Derives the stable surface breadcrumb shown by StatusBar.
 *
 * A store selection is intentionally not an implicit location. In particular,
 * workspace hydration may select the first note in the background; `/materials`
 * must still describe the index surface as `主页 / 笔记库`.
 */
export function deriveStatusPath({
  pathname,
  routeDomain,
  onNavigateHome,
  onNavigateMaterials
}: StatusPathInput): PathSegment[] {
  const home: PathSegment = { id: 'home', label: '主页', onNavigate: onNavigateHome };

  if (pathname === '/') {
    return [{ ...home, current: true }];
  }

  if (pathname === '/showcase') {
    return [home, { id: 'showcase', label: '组件库', current: true }];
  }

  if (routeDomain === 'materials') {
    return [home, { id: 'materials:root', label: '笔记库', onNavigate: onNavigateMaterials, current: true }];
  }

  const domainLabel: Record<WorkDomain, string> = {
    materials: '资料',
    knowledge: '知识库',
    training: '试题库',
    learning: '执行',
    profile: '我的'
  };
  return [home, { id: `domain:${routeDomain}`, label: domainLabel[routeDomain], current: true }];
}
