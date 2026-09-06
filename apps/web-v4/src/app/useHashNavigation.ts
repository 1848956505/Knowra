import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const HISTORY_KEY = 'knowraNavigation';
const MAXIMUM_KEY = 'knowraNavigationMaximum';
function savedMaximum(fallback: number) {
  try { return readPosition() === null ? fallback : Math.max(fallback, Number(sessionStorage.getItem(MAXIMUM_KEY)) || fallback); } catch { return fallback; }
}
function saveMaximum(value: number) {
  try { sessionStorage.setItem(MAXIMUM_KEY, String(value)); } catch { /* 存储被禁用时仍可使用本次会话历史。 */ }
}
function readPath() { return globalThis.location?.hash.slice(1) || '/'; }
function readPosition(): number | null {
  const value = globalThis.history?.state?.[HISTORY_KEY];
  return Number.isInteger(value) ? value : null;
}

/** 自有历史边界防止后退离开应用；hashchange 也兼容地址栏和原生浏览器导航。 */
export function useHashNavigation() {
  const [pathname, setPathname] = useState(readPath);
  const [position, setPosition] = useState(() => readPosition() ?? 0);
  const maximum = useRef(savedMaximum(position));
  const current = useRef(position);
  useEffect(() => {
    if (readPosition() === null) {
      history.replaceState({ ...history.state, [HISTORY_KEY]: 0 }, '');
      saveMaximum(0);
    }
    function onChange() {
      let next = readPosition();
      if (next === null) {
        next = current.current + 1;
        maximum.current = next;
        saveMaximum(next);
        history.replaceState({ ...history.state, [HISTORY_KEY]: next }, '');
      }
      current.current = next;
      setPosition(next);
      setPathname(readPath());
    }
    globalThis.addEventListener('popstate', onChange);
    globalThis.addEventListener('hashchange', onChange);
    return () => {
      globalThis.removeEventListener('popstate', onChange);
      globalThis.removeEventListener('hashchange', onChange);
    };
  }, []);
  const navigate = useCallback((to: string) => {
    if (readPath() === to) return;
    const next = current.current + 1;
    history.pushState({ [HISTORY_KEY]: next }, '', `#${to}`);
    current.current = next;
    maximum.current = next;
    saveMaximum(next);
    setPosition(next);
    setPathname(to);
  }, []);
  const back = useCallback(() => { if (current.current > 0) history.back(); }, []);
  const forward = useCallback(() => { if (current.current < maximum.current) history.forward(); }, []);
  return useMemo(() => ({ pathname, navigate, back, forward, canGoBack: position > 0, canGoForward: position < maximum.current }), [pathname, navigate, back, forward, position]);
}
