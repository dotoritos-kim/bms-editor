/**
 * StatusBar
 *
 * 에디터 하단 상태 표시줄
 * 위치(마디·박자), 그리드, 선택 수, 총 노트 수, 노트 두께, 오디오 상태
 */

import React from 'react';
import { Music, Grid3x3, MousePointer2, ZoomIn, Navigation } from 'lucide-react';
import { cn } from '../../utils';
import { useI18n } from '../../i18n';
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
  const { t } = useI18n();
  const measure = Math.floor(currentBeat / 4);
  const beatInMeasure = (currentBeat % 4).toFixed(2);

  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground',
        className
      )}
    >
      {/* ── Left: navigation info ── */}
      <div className="flex items-center gap-3 min-w-0">
        {/* current position */}
        <div className="flex items-center gap-1 shrink-0" title={t('panels.statusBar.currentPositionTooltip')}>
          <Navigation className="h-3 w-3" />
          <span className="font-mono whitespace-nowrap">
            {String(measure).padStart(3, '0')}{t('panels.statusBar.measureLabel')} · {beatInMeasure}{t('panels.statusBar.beatLabel')}
          </span>
        </div>

        <div className="h-3 w-px bg-muted-foreground/20 shrink-0" />

        {/* grid */}
        <div className="flex items-center gap-1 shrink-0" title={t('panels.statusBar.gridSnapTooltip')}>
          <Grid3x3 className="h-3 w-3" />
          <span className="whitespace-nowrap">1/{gridSnap}</span>
        </div>

        {/* selection */}
        <div className="flex items-center gap-1 shrink-0" title={t('panels.statusBar.selectedNotesTooltip')}>
          <MousePointer2 className="h-3 w-3" />
          <span className="whitespace-nowrap">
            {selectedCount > 0 ? t('panels.statusBar.selectedCount', { count: selectedCount }) : t('panels.statusBar.noSelection')}
          </span>
        </div>

        {/* total notes */}
        <div className="shrink-0 whitespace-nowrap" title={t('panels.statusBar.totalNotesTooltip')}>
          {t('panels.statusBar.totalCount', { count: totalNotes })}
        </div>
      </div>

      {/* ── Right: playback info ── */}
      <div className="flex items-center gap-3 shrink-0 ml-4">
        {/* BPM */}
        <div className="flex items-center gap-1" title="BPM">
          <Music className="h-3 w-3" />
          <span className="whitespace-nowrap">{bpm} BPM</span>
        </div>

        {/* note height */}
        <div className="flex items-center gap-1" title={t('panels.statusBar.noteHeightTooltip')}>
          <ZoomIn className="h-3 w-3" />
          <span className="whitespace-nowrap">{noteHeight}</span>
        </div>

        {/* audio state */}
        {audioReady !== undefined && (
          <div
            className={cn(
              'flex items-center gap-1',
              audioReady ? 'text-green-500' : 'text-muted-foreground'
            )}
            title={audioReady ? t('panels.statusBar.audioReadyTooltip') : t('panels.statusBar.audioMissingTooltip')}
          >
            <div
              className={cn(
                'h-2 w-2 rounded-full',
                audioReady ? 'bg-green-500' : 'bg-muted-foreground/50'
              )}
            />
            <span>{audioReady ? t('panels.statusBar.audioOn') : t('panels.statusBar.audioOff')}</span>
          </div>
        )}
      </div>
    </div>
  );
});

export default StatusBar;
