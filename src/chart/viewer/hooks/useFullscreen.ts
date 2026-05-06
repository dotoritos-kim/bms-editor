/**
 * useFullscreen — fullscreen 요청 / 이탈 + 상태 동기화 훅
 *
 * NoteChartViewer.tsx 에서 추출된 풀스크린 로직.
 */
import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';

export interface UseFullscreenReturn {
  isFullscreen: boolean;
  toggleFullscreen: (containerRef: RefObject<HTMLElement | null>) => Promise<void>;
}

export function useFullscreen(): UseFullscreenReturn {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ESC 키 등 브라우저 네이티브 이벤트로 fullscreen 이 해제될 때 동기화
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggleFullscreen = useCallback(async (containerRef: RefObject<HTMLElement | null>) => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err: unknown) {
      console.error('[useFullscreen] Fullscreen error:', err);
    }
  }, []);

  return { isFullscreen, toggleFullscreen };
}
