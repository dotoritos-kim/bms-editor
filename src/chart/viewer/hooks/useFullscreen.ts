/**
 * useFullscreen — fullscreen request / exit + state sync hook
 *
 * Fullscreen logic extracted from NoteChartViewer.tsx.
 */
import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';

export interface UseFullscreenReturn {
  isFullscreen: boolean;
  toggleFullscreen: (containerRef: RefObject<HTMLElement | null>) => Promise<void>;
}

export function useFullscreen(): UseFullscreenReturn {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync state when fullscreen is exited via native browser events such as the ESC key
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
