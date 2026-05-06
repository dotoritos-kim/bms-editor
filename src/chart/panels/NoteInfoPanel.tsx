/**
 * NoteInfoPanel
 *
 * 선택된 노트의 상세 정보를 표시하는 패널
 * 단일 선택: 키음, 위치, 타이밍, 타입 등 상세 정보
 * 다중 선택: 요약 통계
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Info, Music, MapPin, Clock, Layers, Plus, X } from 'lucide-react';
import { cn } from '../../utils';
import { useI18n } from '../../i18n';
import type { EditableBMSNote, BMSBpmChange, BMSStopEvent } from '@rhythm-archive/bms-core';
import type { GridSnap } from '../NoteChartEditor';

interface NoteInfoPanelProps {
  /** 선택된 노트 목록 */
  selectedNotes: EditableBMSNote[];
  /** WAV 정의 맵 (ID → 파일명) */
  wavDefinitions: Map<string, string>;
  /** BPM 변경 이벤트 목록 */
  bpmChanges: BMSBpmChange[];
  /** STOP 이벤트 목록 */
  stopEvents: BMSStopEvent[];
  /** 초기 BPM */
  initialBpm: number;
  /** 현재 그리드 스냅 설정 */
  gridSnap: GridSnap;
  /** 키음 레이어 추가 콜백 */
  onAddKeysoundLayer?: (noteId: string, keysoundId: string, type: 'invisible' | 'bgm') => void;
  /** 키음 레이어 삭제 콜백 */
  onRemoveKeysoundLayer?: (noteId: string, layerIndex: number) => void;
  /** 현재 선택된 키음 ID (레이어 추가 시 사용) */
  currentKeysound?: string;
  /** 추가 클래스명 */
  className?: string;
}

/**
 * BPM 변경 및 STOP 이벤트를 고려하여 비트 → 초 변환
 */
function beatToSeconds(
  targetBeat: number,
  initialBpm: number,
  bpmChanges: BMSBpmChange[],
  stopEvents: BMSStopEvent[],
): number {
  // BPM 변경을 비트 기준으로 정렬
  const bpmEvents = bpmChanges
    .map((c) => ({
      beat: c.measure * 4 + c.fraction * 4,
      bpm: c.bpm,
    }))
    .sort((a, b) => a.beat - b.beat);

  // STOP 이벤트를 비트 기준으로 정렬
  const stopEvts = stopEvents
    .map((s) => ({
      beat: s.measure * 4 + s.fraction * 4,
      durationBeats: s.duration / 192, // 192 = 1 beat
    }))
    .sort((a, b) => a.beat - b.beat);

  let currentBpm = initialBpm;
  let currentBeat = 0;
  let totalSeconds = 0;

  // BPM 변경점과 STOP 이벤트를 시간순으로 처리
  let bpmIdx = 0;
  let stopIdx = 0;

  while (currentBeat < targetBeat) {
    // 다음 이벤트 비트 찾기
    let nextEventBeat = targetBeat;
    if (bpmIdx < bpmEvents.length && bpmEvents[bpmIdx].beat < nextEventBeat) {
      nextEventBeat = bpmEvents[bpmIdx].beat;
    }
    if (stopIdx < stopEvts.length && stopEvts[stopIdx].beat < nextEventBeat) {
      nextEventBeat = stopEvts[stopIdx].beat;
    }

    // 현재 비트에서 다음 이벤트까지의 시간 누적
    const beatDelta = nextEventBeat - currentBeat;
    if (beatDelta > 0 && currentBpm > 0) {
      totalSeconds += (beatDelta / currentBpm) * 60;
    }
    currentBeat = nextEventBeat;

    // 이벤트 처리
    if (bpmIdx < bpmEvents.length && Math.abs(bpmEvents[bpmIdx].beat - currentBeat) < 0.0001) {
      currentBpm = bpmEvents[bpmIdx].bpm;
      bpmIdx++;
    }
    if (stopIdx < stopEvts.length && Math.abs(stopEvts[stopIdx].beat - currentBeat) < 0.0001) {
      if (currentBpm > 0) {
        totalSeconds += (stopEvts[stopIdx].durationBeats / currentBpm) * 60;
      }
      stopIdx++;
    }
  }

  return totalSeconds;
}

/**
 * 비트가 그리드 스냅에 정확히 맞는지 확인
 */
function isOnGrid(beat: number, gridSnap: GridSnap): boolean {
  const TICKS_PER_BEAT = 960;
  const tick = Math.round(beat * TICKS_PER_BEAT);
  const gridTicks = Math.round(TICKS_PER_BEAT * 4 / gridSnap);
  return gridTicks > 0 && tick % gridTicks === 0;
}

/**
 * 비트를 마디:분수 형태로 포맷
 */
function formatBeatPosition(beat: number): string {
  const measure = Math.floor(beat / 4);
  const fraction = (beat % 4) / 4;
  return `#${measure.toString().padStart(3, '0')}:${fraction.toFixed(4)}`;
}

/**
 * 노트 타입 한글 표시
 */
function noteTypeLabel(noteType: string | undefined): string {
  switch (noteType) {
    case 'playable': return 'Playable';
    case 'invisible': return 'Invisible';
    case 'landmine': return 'Landmine';
    case 'bgm': return 'BGM';
    default: return 'Playable';
  }
}

/** 정보 행 */
function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('text-right', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

export const NoteInfoPanel = React.memo(function NoteInfoPanel({
  selectedNotes,
  wavDefinitions,
  bpmChanges,
  stopEvents,
  initialBpm,
  gridSnap,
  onAddKeysoundLayer,
  onRemoveKeysoundLayer,
  currentKeysound,
  className,
}: NoteInfoPanelProps) {
  const { t } = useI18n();
  const [addLayerType, setAddLayerType] = useState<'invisible' | 'bgm'>('invisible');

  const handleAddLayer = useCallback(() => {
    if (!singleNoteRef.current || !onAddKeysoundLayer || !currentKeysound) return;
    onAddKeysoundLayer(singleNoteRef.current.id, currentKeysound, addLayerType);
  }, [onAddKeysoundLayer, currentKeysound, addLayerType]);

  // Ref to track single note for callbacks
  const singleNoteRef = React.useRef<EditableBMSNote | null>(null);
  // 단일 선택 정보
  const singleNote = selectedNotes.length === 1 ? selectedNotes[0] : null;

  // 단일 노트 상세 정보 계산
  const noteDetails = useMemo(() => {
    if (!singleNote) return null;

    const wavFilename = wavDefinitions.get(singleNote.keysound) || '';
    const keysoundDisplay =
      singleNote.keysound === '00'
        ? t('panels.noteInfo.values.silentKeysound')
        : `${singleNote.keysound}${wavFilename ? ` → ${wavFilename}` : ''}`;

    const timeSeconds = beatToSeconds(singleNote.beat, initialBpm, bpmChanges, stopEvents);
    const onGrid = isOnGrid(singleNote.beat, gridSnap);

    const hasLongNote = singleNote.endBeat !== undefined;
    let lnEndTime: number | undefined;
    let lnLength: number | undefined;
    if (hasLongNote && singleNote.endBeat !== undefined) {
      lnEndTime = beatToSeconds(singleNote.endBeat, initialBpm, bpmChanges, stopEvents);
      lnLength = singleNote.endBeat - singleNote.beat;
    }

    return {
      keysoundDisplay,
      timeSeconds,
      onGrid,
      hasLongNote,
      lnEndTime,
      lnLength,
    };
  }, [singleNote, wavDefinitions, bpmChanges, stopEvents, initialBpm, gridSnap, t]);

  // 다중 선택 요약 정보
  const multiSummary = useMemo(() => {
    if (selectedNotes.length <= 1) return null;

    const types = new Map<string, number>();
    const columns = new Set<string>();
    const keysounds = new Set<string>();
    let minBeat = Infinity;
    let maxBeat = -Infinity;

    for (const note of selectedNotes) {
      const type = note.noteType || 'playable';
      types.set(type, (types.get(type) || 0) + 1);
      if (note.column) columns.add(note.column);
      keysounds.add(note.keysound);
      if (note.beat < minBeat) minBeat = note.beat;
      const endBeat = note.endBeat ?? note.beat;
      if (endBeat > maxBeat) maxBeat = endBeat;
    }

    const typeEntries = Array.from(types.entries())
      .map(([type, count]) => `${noteTypeLabel(type)} ${count}`)
      .join(', ');

    const columnList = Array.from(columns).sort().join(', ');

    return {
      count: selectedNotes.length,
      typeEntries,
      columnList,
      beatRange: `${minBeat.toFixed(2)} - ${maxBeat.toFixed(2)}`,
      keysoundCount: keysounds.size,
    };
  }, [selectedNotes]);

  if (selectedNotes.length === 0) {
    return (
      <div className={cn('flex flex-col', className)}>
        <div className="px-3 py-2 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            {t('panels.noteInfo.title')}
          </h3>
        </div>
        <div className="p-4 text-center text-xs text-muted-foreground">
          {t('panels.noteInfo.empty')}
        </div>
      </div>
    );
  }

  // multi-selection summary
  if (multiSummary) {
    return (
      <div className={cn('flex flex-col', className)}>
        <div className="px-3 py-2 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            {t('panels.noteInfo.multiTitle')}
          </h3>
        </div>
        <div className="px-3 py-2 text-xs space-y-0.5">
          <InfoRow label={t('panels.noteInfo.labels.selection')} value={t('panels.noteInfo.values.notesCount', { count: multiSummary.count })} />
          <InfoRow label={t('panels.noteInfo.labels.type')} value={multiSummary.typeEntries} />
          <InfoRow label={t('panels.noteInfo.labels.column')} value={multiSummary.columnList} mono />
          <InfoRow label={t('panels.noteInfo.labels.beatRange')} value={multiSummary.beatRange} mono />
          <InfoRow label={t('panels.noteInfo.labels.keysound')} value={t('panels.noteInfo.values.uniqueKeysoundsCount', { count: multiSummary.keysoundCount })} />
        </div>
      </div>
    );
  }

  // 단일 선택 상세
  if (!singleNote || !noteDetails) return null;

  // singleNoteRef 업데이트
  singleNoteRef.current = singleNote;

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="px-3 py-2 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" />
          {t('panels.noteInfo.title')}
        </h3>
      </div>
      <div className="px-3 py-2 text-xs space-y-0.5">
        {/* type */}
        <InfoRow label={t('panels.noteInfo.labels.type')} value={noteTypeLabel(singleNote.noteType)} />

        {/* column */}
        {singleNote.column && (
          <InfoRow label={t('panels.noteInfo.labels.column')} value={singleNote.column} mono />
        )}

        {/* keysound */}
        <div className="flex justify-between items-start py-0.5">
          <span className="text-muted-foreground flex items-center gap-1">
            <Music className="h-3 w-3" />
            {t('panels.noteInfo.labels.keysound')}
          </span>
          <span className="font-mono text-right max-w-[120px] truncate" title={noteDetails.keysoundDisplay}>
            {noteDetails.keysoundDisplay}
          </span>
        </div>

        {/* multi keysound layers */}
        {(singleNote.additionalKeysounds && singleNote.additionalKeysounds.length > 0) && (
          <div className="mt-1 pt-1 border-t border-dashed">
            <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
              <Layers className="h-3 w-3" />
              {t('panels.noteInfo.labels.layer')}
            </div>
            {singleNote.additionalKeysounds.map((layer, i) => {
              const layerFilename = wavDefinitions.get(layer.keysound) || '';
              return (
                <div key={i} className="flex items-center gap-1 py-0.5">
                  <span className="text-xs text-muted-foreground px-1 rounded bg-muted">
                    {layer.type === 'invisible' ? 'INV' : 'BGM'}
                  </span>
                  <span className="font-mono text-xs truncate flex-1" title={layerFilename}>
                    {layer.keysound}{layerFilename ? ` → ${layerFilename}` : ''}
                  </span>
                  {onRemoveKeysoundLayer && (
                    <button
                      onClick={() => onRemoveKeysoundLayer(singleNote.id, i)}
                      className="p-1 hover:text-destructive shrink-0"
                      title={t('panels.noteInfo.tooltips.deleteLayer')}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* add layer */}
        {onAddKeysoundLayer && currentKeysound && (
          <div className="mt-1 pt-1 border-t border-dashed">
            <div className="flex items-center gap-1">
              <select
                value={addLayerType}
                onChange={(e) => setAddLayerType(e.target.value as 'invisible' | 'bgm')}
                className="px-1 py-0.5 text-xs bg-muted rounded flex-1 min-w-0"
              >
                <option value="invisible">Invisible</option>
                <option value="bgm">BGM</option>
              </select>
              <button
                onClick={handleAddLayer}
                className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded bg-primary/10 hover:bg-primary/20 text-primary shrink-0"
                title={t('panels.noteInfo.tooltips.addLayer', { id: currentKeysound })}
              >
                <Plus className="h-2.5 w-2.5" />
                {currentKeysound}
              </button>
            </div>
          </div>
        )}

        {/* position */}
        <div className="mt-1 pt-1 border-t border-dashed">
          <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
            <MapPin className="h-3 w-3" />
            {t('panels.noteInfo.labels.position')}
          </div>
          <InfoRow label={t('panels.noteInfo.labels.beat')} value={singleNote.beat.toFixed(4)} mono />
          <InfoRow label={t('panels.noteInfo.labels.measure')} value={formatBeatPosition(singleNote.beat)} mono />
          <InfoRow
            label={t('panels.noteInfo.labels.grid')}
            value={noteDetails.onGrid ? t('panels.noteInfo.values.gridAligned', { snap: gridSnap }) : t('panels.noteInfo.values.gridUnaligned')}
          />
        </div>

        {/* timing */}
        <div className="mt-1 pt-1 border-t border-dashed">
          <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
            <Clock className="h-3 w-3" />
            {t('panels.noteInfo.labels.timing')}
          </div>
          <InfoRow label={t('panels.noteInfo.labels.playTime')} value={`${noteDetails.timeSeconds.toFixed(3)}s`} mono />
          <InfoRow label={t('panels.noteInfo.labels.channel')} value={singleNote.channel} mono />
        </div>

        {/* long note info */}
        {noteDetails.hasLongNote && singleNote.endBeat !== undefined && (
          <div className="mt-1 pt-1 border-t border-dashed">
            <div className="text-muted-foreground mb-0.5">{t('panels.noteInfo.labels.longNote')}</div>
            <InfoRow label={t('panels.noteInfo.labels.endBeat')} value={singleNote.endBeat.toFixed(4)} mono />
            <InfoRow label={t('panels.noteInfo.labels.length')} value={`${noteDetails.lnLength?.toFixed(4)} beats`} mono />
            {noteDetails.lnEndTime !== undefined && (
              <InfoRow label={t('panels.noteInfo.labels.endTime')} value={`${noteDetails.lnEndTime.toFixed(3)}s`} mono />
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default NoteInfoPanel;
