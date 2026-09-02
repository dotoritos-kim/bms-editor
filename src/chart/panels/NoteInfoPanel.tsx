/**
 * NoteInfoPanel
 *
 * Panel that displays detailed information about the selected note(s).
 * Single selection: keysound, position, timing, type, and other details.
 * Multi-selection: summary statistics.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Info, Music, MapPin, Clock, Layers, Plus, X } from 'lucide-react';
import { cn } from '../../utils';
import { useI18n } from '../../i18n';
import type { EditableBMSNote, BMSBpmChange, BMSStopEvent } from '@rhythm-archive/bms-core';
import type { GridSnap } from '../NoteChartEditor';

interface NoteInfoPanelProps {
  /** List of selected notes */
  selectedNotes: EditableBMSNote[];
  /** WAV definition map (ID → filename) */
  wavDefinitions: Map<string, string>;
  /** BPM change event list */
  bpmChanges: BMSBpmChange[];
  /** STOP event list */
  stopEvents: BMSStopEvent[];
  /** Initial BPM */
  initialBpm: number;
  /** Current grid snap setting */
  gridSnap: GridSnap;
  /** Callback to add a keysound layer */
  onAddKeysoundLayer?: (noteId: string, keysoundId: string, type: 'invisible' | 'bgm') => void;
  /** Callback to remove a keysound layer */
  onRemoveKeysoundLayer?: (noteId: string, layerIndex: number) => void;
  /** Currently selected keysound ID (used when adding a layer) */
  currentKeysound?: string;
  /** Additional class name */
  className?: string;
}

/**
 * Convert beat → seconds, accounting for BPM changes and STOP events.
 */
function beatToSeconds(
  targetBeat: number,
  initialBpm: number,
  bpmChanges: BMSBpmChange[],
  stopEvents: BMSStopEvent[],
): number {
  // Sort BPM changes by beat position
  const bpmEvents = bpmChanges
    .map((c) => ({
      beat: c.measure * 4 + c.fraction * 4,
      bpm: c.bpm,
    }))
    .sort((a, b) => a.beat - b.beat);

  // Sort STOP events by beat position
  const stopEvts = stopEvents
    .map((s) => ({
      beat: s.measure * 4 + s.fraction * 4,
      durationBeats: s.duration / 48, // #STOP is in 1/192 whole notes = 1/48 beat (matches bms-core Timing)
    }))
    .sort((a, b) => a.beat - b.beat);

  let currentBpm = initialBpm;
  let currentBeat = 0;
  let totalSeconds = 0;

  // Process BPM changes and STOP events in chronological order
  let bpmIdx = 0;
  let stopIdx = 0;

  while (currentBeat < targetBeat) {
    // Find the next event beat
    let nextEventBeat = targetBeat;
    if (bpmIdx < bpmEvents.length && bpmEvents[bpmIdx].beat < nextEventBeat) {
      nextEventBeat = bpmEvents[bpmIdx].beat;
    }
    if (stopIdx < stopEvts.length && stopEvts[stopIdx].beat < nextEventBeat) {
      nextEventBeat = stopEvts[stopIdx].beat;
    }

    // Accumulate time from current beat to the next event
    const beatDelta = nextEventBeat - currentBeat;
    if (beatDelta > 0 && currentBpm > 0) {
      totalSeconds += (beatDelta / currentBpm) * 60;
    }
    currentBeat = nextEventBeat;

    // Process events at the current beat
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
 * Check whether a beat aligns exactly to the grid snap.
 */
function isOnGrid(beat: number, gridSnap: GridSnap): boolean {
  const TICKS_PER_BEAT = 960;
  const tick = Math.round(beat * TICKS_PER_BEAT);
  const gridTicks = Math.round(TICKS_PER_BEAT * 4 / gridSnap);
  return gridTicks > 0 && tick % gridTicks === 0;
}

/**
 * Format a beat as measure:fraction.
 */
function formatBeatPosition(beat: number): string {
  const measure = Math.floor(beat / 4);
  const fraction = (beat % 4) / 4;
  return `#${measure.toString().padStart(3, '0')}:${fraction.toFixed(4)}`;
}

/**
 * Display label for note type.
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

/** Info row */
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
  // Single selection info
  const singleNote = selectedNotes.length === 1 ? selectedNotes[0] : null;

  // Compute single-note detail info
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

  // Multi-selection summary info
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

  // Single selection detail
  if (!singleNote || !noteDetails) return null;

  // Update singleNoteRef
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
