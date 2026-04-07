/**
 * StatusBar
 *
 * 에디터 하단 상태 표시줄
 * 위치(마디·박자), 그리드, 선택 수, 총 노트 수, 노트 두께, 오디오 상태
 */

import React from 'react';
import { Music, Grid3x3, MousePointer2, ZoomIn, Navigation } from 'lucide-react';
import { cn } from '../../utils';
import type { GridSnap } from '../NoteChartEditor';

interface StatusBarProps {
  /** 현재 스크롤 비트 */
  currentBeat: number;
  /** 그리드 스냅 */
  gridSnap: GridSnap;
  /** 선택된 노트 수 */
  selectedCount: number;
  /** 총 노트 수 */
  totalNotes: number;
  /** 현재 BPM */
  bpm: number;
  /** 노트 두께 (1~8) */
  noteHeight: number;
  /** 오디오 로드 상태 */
  audioReady?: boolean;
  /** 추가 클래스명 */
  className?: string;
}

export const StatusBar = React.memo(function StatusBar({
  currentBeat,
  gridSnap,
  selectedCount,
  totalNotes,
  bpm,
  noteHeight,
  audioReady,
  className,
}: StatusBarProps) {
  const measure = Math.floor(currentBeat / 4);
  const beatInMeasure = (currentBeat % 4).toFixed(2);

  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground',
        className
      )}
    >
      {/* ── 좌측: 탐색 정보 ── */}
      <div className="flex items-center gap-3 min-w-0">
        {/* 현재 위치 */}
        <div className="flex items-center gap-1 shrink-0" title="현재 위치 (마디·박자)">
          <Navigation className="h-3 w-3" />
          <span className="font-mono whitespace-nowrap">
            {String(measure).padStart(3, '0')}마디 · {beatInMeasure}박
          </span>
        </div>

        <div className="h-3 w-px bg-muted-foreground/20 shrink-0" />

        {/* 그리드 */}
        <div className="flex items-center gap-1 shrink-0" title="그리드 스냅">
          <Grid3x3 className="h-3 w-3" />
          <span className="whitespace-nowrap">1/{gridSnap}</span>
        </div>

        {/* 선택 */}
        <div className="flex items-center gap-1 shrink-0" title="선택된 노트">
          <MousePointer2 className="h-3 w-3" />
          <span className="whitespace-nowrap">
            {selectedCount > 0 ? `${selectedCount}개 선택` : '선택 없음'}
          </span>
        </div>

        {/* 총 노트 */}
        <div className="shrink-0 whitespace-nowrap" title="총 노트 수">
          총 {totalNotes}개
        </div>
      </div>

      {/* ── 우측: 재생 정보 ── */}
      <div className="flex items-center gap-3 shrink-0 ml-4">
        {/* BPM */}
        <div className="flex items-center gap-1" title="BPM">
          <Music className="h-3 w-3" />
          <span className="whitespace-nowrap">{bpm} BPM</span>
        </div>

        {/* 노트 두께 */}
        <div className="flex items-center gap-1" title="노트 두께">
          <ZoomIn className="h-3 w-3" />
          <span className="whitespace-nowrap">{noteHeight}</span>
        </div>

        {/* 오디오 상태 */}
        {audioReady !== undefined && (
          <div
            className={cn(
              'flex items-center gap-1',
              audioReady ? 'text-green-500' : 'text-muted-foreground'
            )}
            title={audioReady ? '오디오 준비됨' : '오디오 미로드'}
          >
            <div
              className={cn(
                'h-2 w-2 rounded-full',
                audioReady ? 'bg-green-500' : 'bg-muted-foreground/50'
              )}
            />
            <span>{audioReady ? '오디오' : '음소거'}</span>
          </div>
        )}
      </div>
    </div>
  );
});

export default StatusBar;
