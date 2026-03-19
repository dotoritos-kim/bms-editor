/**
 * Minimap
 *
 * 에디터 미니맵 컴포넌트
 * 2D Canvas 기반 노트 밀도 시각화, 클릭으로 이동
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { cn } from '../../utils';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

interface MinimapProps {
  /** 노트 배열 */
  notes: EditableBMSNote[];
  /** 총 비트 수 */
  totalBeats: number;
  /** 현재 스크롤 비트 */
  currentBeat: number;
  /** 현재 뷰포트 높이 (비트 단위) */
  viewportBeats: number;
  /** 비트 위치로 이동 콜백 */
  onNavigate: (beat: number) => void;
  /** 추가 클래스명 */
  className?: string;
}

const MINIMAP_WIDTH = 60;
const MINIMAP_MAX_HEIGHT = 200;
const NOTE_DOT_SIZE = 2;

export const Minimap = React.memo(function Minimap({
  notes,
  totalBeats,
  currentBeat,
  viewportBeats,
  onNavigate,
  className,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasHeight, setCanvasHeight] = useState(MINIMAP_MAX_HEIGHT);

  // 컨테이너 크기에 맞춰 캔버스 높이 조절
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const availableHeight = entry.contentRect.height;
        setCanvasHeight(Math.min(availableHeight, MINIMAP_MAX_HEIGHT));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 미니맵 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const height = canvas.height;
    const width = canvas.width;
    const scale = height / Math.max(totalBeats, 1);

    // 배경
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, width, height);

    // 마디선
    ctx.strokeStyle = '#222244';
    ctx.lineWidth = 0.5;
    for (let beat = 0; beat <= totalBeats; beat += 4) {
      const y = height - beat * scale;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 노트 점
    for (const note of notes) {
      const y = height - note.beat * scale;
      const x = width * 0.2 + Math.random() * width * 0.6; // 간단한 분포

      switch (note.noteType) {
        case 'landmine':
          ctx.fillStyle = '#ff4444';
          break;
        case 'invisible':
          ctx.fillStyle = '#666666';
          break;
        default:
          ctx.fillStyle = '#6688ff';
      }

      ctx.fillRect(x - NOTE_DOT_SIZE / 2, y - NOTE_DOT_SIZE / 2, NOTE_DOT_SIZE, NOTE_DOT_SIZE);
    }

    // 현재 뷰포트 (반투명 사각형)
    const vpY = height - (currentBeat + viewportBeats) * scale;
    const vpH = viewportBeats * scale;
    ctx.fillStyle = 'rgba(100, 150, 255, 0.15)';
    ctx.fillRect(0, vpY, width, vpH);
    ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, vpY, width, vpH);
  }, [notes, totalBeats, currentBeat, viewportBeats, canvasHeight]);

  // 클릭으로 이동
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const scale = canvas.height / Math.max(totalBeats, 1);
      const beat = (canvas.height - y) / scale;

      onNavigate(Math.max(0, Math.min(totalBeats, beat)));
    },
    [totalBeats, onNavigate]
  );

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="px-2 py-1 text-xs font-semibold border-b shrink-0">미니맵</div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={MINIMAP_WIDTH}
          height={canvasHeight}
          className="cursor-pointer block"
          onClick={handleClick}
          title="클릭하여 이동"
        />
      </div>
    </div>
  );
});

export default Minimap;
