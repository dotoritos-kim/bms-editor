/**
 * useViewerScroll — 스크롤/드래그/모멘텀/터치/휠 이벤트 핸들러 훅
 *
 * NoteChartViewer.tsx 에서 추출된 스크롤 인터랙션 로직.
 * containerRef 에 touch/wheel 이벤트를 등록하고 cleanup 합니다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface UseViewerScrollOptions {
  containerRef: RefObject<HTMLElement | null>;
  /** viewMode — 훅 내부 ref로 추적, 렌더마다 최신값 전달 */
  viewMode: string;
  initialScrollBeat?: number;
  scrollToBeat?: number;
}

/** 훅 외부에서 업데이트해야 하는 스크롤 설정 ref */
export interface ScrollConfigRef {
  maxBeat: number;
  effectiveBeatScale: number;
  scrollSpeed: number;
}

export interface UseViewerScrollReturn {
  scrollBeat: number;
  setScrollBeat: React.Dispatch<React.SetStateAction<number>>;
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
  /** 외부에서 maxBeat/effectiveBeatScale/scrollSpeed 를 직접 주입하는 ref */
  scrollConfigRef: React.MutableRefObject<ScrollConfigRef>;
}

export function useViewerScroll({
  containerRef,
  viewMode,
  initialScrollBeat,
  scrollToBeat,
}: UseViewerScrollOptions): UseViewerScrollReturn {
  const [scrollBeat, setScrollBeat] = useState(initialScrollBeat ?? 0);

  // 외부에서 scrollToBeat가 변경되면 해당 위치로 이동
  useEffect(() => {
    if (scrollToBeat !== undefined && scrollToBeat >= 0) {
      setScrollBeat(scrollToBeat);
    }
  }, [scrollToBeat]);

  // maxBeat/effectiveBeatScale/scrollSpeed 는 외부(NoteChartViewer)에서 이 ref에 직접 기록
  const scrollConfigRef = useRef<ScrollConfigRef>({
    maxBeat: 100,
    effectiveBeatScale: 20,
    scrollSpeed: 1,
  });

  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartBeat, setDragStartBeat] = useState(0);
  const [velocity, setVelocity] = useState(0);
  const [lastY, setLastY] = useState(0);
  const momentumRef = useRef<number | null>(null);

  // Stable refs (모두 closure-free native 핸들러에서 사용)
  const viewModeRef = useRef(viewMode);
  const scrollBeatRef = useRef(scrollBeat);
  const isDraggingRef = useRef(isDragging);
  const dragStartYRef = useRef(dragStartY);
  const dragStartBeatRef = useRef(dragStartBeat);
  const lastYRef = useRef(lastY);
  const velocityRef = useRef(velocity);

  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { scrollBeatRef.current = scrollBeat; }, [scrollBeat]);
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);
  useEffect(() => { dragStartYRef.current = dragStartY; }, [dragStartY]);
  useEffect(() => { dragStartBeatRef.current = dragStartBeat; }, [dragStartBeat]);
  useEffect(() => { lastYRef.current = lastY; }, [lastY]);
  useEffect(() => { velocityRef.current = velocity; }, [velocity]);

  // -------------------------------------------------------------------------
  // Momentum (scrollConfigRef.maxBeat 를 ref로 읽어 stale closure 방지)
  // -------------------------------------------------------------------------
  const applyMomentum = useCallback(() => {
    if (Math.abs(velocityRef.current) < 0.01) { setVelocity(0); return; }
    const { maxBeat } = scrollConfigRef.current;
    setScrollBeat(prev => Math.max(0, Math.min(maxBeat, prev + velocityRef.current)));
    setVelocity(prev => prev * 0.92);
    momentumRef.current = requestAnimationFrame(applyMomentum);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isDragging && Math.abs(velocity) > 0.01) {
      momentumRef.current = requestAnimationFrame(applyMomentum);
    }
    return () => { if (momentumRef.current) cancelAnimationFrame(momentumRef.current); };
  }, [isDragging, velocity, applyMomentum]);

  // -------------------------------------------------------------------------
  // React synthetic mouse handlers
  // -------------------------------------------------------------------------
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (viewModeRef.current !== 'scroll') return;
    if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); setVelocity(0); }
    setIsDragging(true);
    setDragStartY(e.clientY);
    setDragStartBeat(scrollBeatRef.current);
    setLastY(e.clientY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || viewModeRef.current !== 'scroll') return;
    const { effectiveBeatScale, scrollSpeed, maxBeat } = scrollConfigRef.current;
    const deltaY = dragStartYRef.current - e.clientY;
    const scrollSensitivity = effectiveBeatScale / scrollSpeed;
    setScrollBeat(Math.max(0, Math.min(maxBeat, dragStartBeatRef.current + deltaY / scrollSensitivity)));
    setVelocity((lastYRef.current - e.clientY) / scrollSensitivity);
    setLastY(e.clientY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  // -------------------------------------------------------------------------
  // Native touch/wheel handlers (passive: false requires addEventListener)
  // -------------------------------------------------------------------------
  const handleNativeTouchStart = useCallback((e: TouchEvent) => {
    if (viewModeRef.current !== 'scroll') return;
    if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); setVelocity(0); }
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStartY(touch.clientY);
    setDragStartBeat(scrollBeatRef.current);
    setLastY(touch.clientY);
  }, []);

  const handleNativeTouchMove = useCallback((e: TouchEvent) => {
    if (!isDraggingRef.current || viewModeRef.current !== 'scroll') return;
    e.preventDefault();
    const touch = e.touches[0];
    const { effectiveBeatScale, scrollSpeed, maxBeat } = scrollConfigRef.current;
    const deltaY = dragStartYRef.current - touch.clientY;
    const scrollSensitivity = effectiveBeatScale / scrollSpeed;
    setScrollBeat(Math.max(0, Math.min(maxBeat, dragStartBeatRef.current + deltaY / scrollSensitivity)));
    setVelocity((lastYRef.current - touch.clientY) / scrollSensitivity * 1.5);
    setLastY(touch.clientY);
  }, []);

  const handleNativeTouchEnd = useCallback(() => setIsDragging(false), []);

  const handleNativeWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05;
      setZoomLevel(prev => Math.max(0.25, Math.min(4, prev * zoomFactor)));
      return;
    }
    if (viewModeRef.current !== 'scroll') return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
    }
    if (momentumRef.current) { cancelAnimationFrame(momentumRef.current); setVelocity(0); }
    const { effectiveBeatScale, scrollSpeed, maxBeat } = scrollConfigRef.current;
    const scrollSensitivity = effectiveBeatScale / scrollSpeed;
    setScrollBeat(prev => Math.max(0, Math.min(maxBeat, prev + e.deltaY / scrollSensitivity)));
  }, []);

  // Register native events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleNativeTouchStart, { passive: true });
    container.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    container.addEventListener('touchend', handleNativeTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleNativeTouchEnd, { passive: true });
    container.addEventListener('wheel', handleNativeWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleNativeTouchStart);
      container.removeEventListener('touchmove', handleNativeTouchMove);
      container.removeEventListener('touchend', handleNativeTouchEnd);
      container.removeEventListener('touchcancel', handleNativeTouchEnd);
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, [containerRef, handleNativeTouchStart, handleNativeTouchMove, handleNativeTouchEnd, handleNativeWheel]);

  return {
    scrollBeat,
    setScrollBeat,
    zoomLevel,
    setZoomLevel,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    scrollConfigRef,
  };
}
