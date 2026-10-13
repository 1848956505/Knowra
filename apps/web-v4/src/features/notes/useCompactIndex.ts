import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px), (any-pointer: coarse)';

/** 触屏或手机宽度：索引页把标题与工具合成一行。无 matchMedia（测试环境）按桌面处理。 */
export function useCompactIndex() {
  const [compact, setCompact] = useState(() => window.matchMedia?.(QUERY).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(QUERY);
    if (!media) return;
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}
