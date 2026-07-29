/**
 * BmsChartDiff Component
 *
 * Component for visually comparing changes in a BMS chart.
 * Sidebar change list + chart viewer + navigation support.
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { GitBranch, Plus, Minus, RefreshCw, ChevronUp, ChevronDown, Eye, EyeOff, Check } from 'lucide-react';
import { NoteChartViewer, KEY_MODE_DISPLAY } from './NoteChartViewer';
import type { KeyMode } from './NoteChartViewer';
import type { BMSNote } from '@rhythm-archive/bms-core';
import { cn } from '../utils';
import { useI18n } from '../i18n';

export interface ChartInfo {
  notes: BMSNote[];
  keyMode: KeyMode;
  totalBeats: number;
  bpm: {
    initial: number;
    min: number;
    max: number;
  };
  stats: {
    total: number;
    scratch: number;
    longNotes: number;
    landmines: number;
  };
  /** Header info (optional, for diff display) */
  headers?: Record<string, string>;
}

export interface BmsChartDiffProps {
  /** Previous version chart info (null means newly added) */
  oldChart: ChartInfo | null;
  /** New version chart info (null means deleted) */
  newChart: ChartInfo | null;
  /** File path */
  filePath: string;
  /** Additional class name */
  className?: string;
  /** Chart viewer height (default: full height) */
  viewerHeight?: number;
}

/** Change group per measure */
interface MeasureChange {
  measure: number;
  beat: number;
  added: number;
  removed: number;
  modified: number;
}

/**
 * Generate a key for note comparison
 */
function getNoteKey(note: BMSNote): string {
  return `${note.beat.toFixed(4)}-${note.column || 'bgm'}-${note.keysound}`;
}

/**
 * Calculate note diff between two charts (including modified note detection)
 */
function calculateNoteDiff(
  oldNotes: BMSNote[],
  newNotes: BMSNote[]
): { added: BMSNote[]; removed: BMSNote[]; modified: BMSNote[]; unchanged: BMSNote[] } {
  const oldNoteKeys = new Map<string, BMSNote>();
  const newNoteKeys = new Map<string, BMSNote>();

  for (const note of oldNotes) {
    oldNoteKeys.set(getNoteKey(note), note);
  }

  for (const note of newNotes) {
    newNoteKeys.set(getNoteKey(note), note);
  }

  const rawAdded: BMSNote[] = [];
  const rawRemoved: BMSNote[] = [];
  const unchanged: BMSNote[] = [];

  for (const [key, note] of newNoteKeys) {
    if (!oldNoteKeys.has(key)) {
      rawAdded.push(note);
    } else {
      unchanged.push(note);
    }
  }

  for (const [key, note] of oldNoteKeys) {
    if (!newNoteKeys.has(key)) {
      rawRemoved.push(note);
    }
  }

  // Modification detection: match removed+added by same position or same column+keysound
  const modified: BMSNote[] = [];
  const matchedRemovedIds = new Set<number>();
  const matchedAddedIds = new Set<number>();

  for (let ai = 0; ai < rawAdded.length; ai++) {
    const added = rawAdded[ai];
    for (let ri = 0; ri < rawRemoved.length; ri++) {
      if (matchedRemovedIds.has(ri)) continue;
      const removed = rawRemoved[ri];

      const sameColumn = added.column === removed.column && added.column !== undefined;
      const nearBeat = Math.abs(added.beat - removed.beat) < 2;
      const samePosition = Math.abs(added.beat - removed.beat) < 0.001 && added.column === removed.column;
      const differentKeysound = added.keysound !== removed.keysound;

      if ((sameColumn && nearBeat) || (samePosition && differentKeysound)) {
        modified.push(added);
        matchedRemovedIds.add(ri);
        matchedAddedIds.add(ai);
        break;
      }
    }
  }

  const added = rawAdded.filter((_, i) => !matchedAddedIds.has(i));
  const removed = rawRemoved.filter((_, i) => !matchedRemovedIds.has(i));

  return { added, removed, modified, unchanged };
}

/**
 * Convert beat to measure number (assumes 4/4 time)
 */
function beatToMeasure(beat: number): number {
  return Math.floor(beat / 4);
}

/**
 * BMS chart diff component
 */
export function BmsChartDiff({
  oldChart,
  newChart,
  filePath: _filePath,
  className,
  viewerHeight,
}: BmsChartDiffProps) {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [showChangesOnly, setShowChangesOnly] = useState(false);
  const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
  const [scrollToBeat, setScrollToBeat] = useState<number | undefined>(undefined);
  const [splitScrollToBeat, setSplitScrollToBeat] = useState<number | undefined>(undefined);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Determine change type
  const changeType = useMemo(() => {
    if (!oldChart && newChart) return 'added';
    if (oldChart && !newChart) return 'deleted';
    return 'modified';
  }, [oldChart, newChart]);

  // Calculate note diff
  const noteDiff = useMemo(() => {
    if (changeType === 'added' && newChart) {
      return {
        added: newChart.notes.filter(n => n.noteType === 'playable' || !n.noteType),
        removed: [],
        modified: [],
        unchanged: [],
      };
    }
    if (changeType === 'deleted' && oldChart) {
      return {
        added: [],
        removed: oldChart.notes.filter(n => n.noteType === 'playable' || !n.noteType),
        modified: [],
        unchanged: [],
      };
    }
    if (oldChart && newChart) {
      return calculateNoteDiff(
        oldChart.notes.filter(n => n.noteType === 'playable' || !n.noteType),
        newChart.notes.filter(n => n.noteType === 'playable' || !n.noteType)
      );
    }
    return { added: [], removed: [], modified: [], unchanged: [] };
  }, [oldChart, newChart, changeType]);

  // Calculate stats diff
  const statsDiff = useMemo(() => {
    const oldStats = oldChart?.stats || { total: 0, scratch: 0, longNotes: 0, landmines: 0 };
    const newStats = newChart?.stats || { total: 0, scratch: 0, longNotes: 0, landmines: 0 };
    return {
      total: newStats.total - oldStats.total,
      scratch: newStats.scratch - oldStats.scratch,
      longNotes: newStats.longNotes - oldStats.longNotes,
      landmines: newStats.landmines - oldStats.landmines,
    };
  }, [oldChart, newChart]);

  // Detect header changes
  const headerChanges = useMemo(() => {
    if (!oldChart?.headers || !newChart?.headers) return [];
    const changes: Array<{ key: string; oldVal: string; newVal: string }> = [];
    const allKeys = new Set([
      ...Object.keys(oldChart.headers),
      ...Object.keys(newChart.headers),
    ]);
    const DISPLAY_KEYS = ['TITLE', 'SUBTITLE', 'ARTIST', 'SUBARTIST', 'GENRE', 'BPM', 'PLAYLEVEL', 'RANK', 'TOTAL', 'DIFFICULTY', 'STAGEFILE', 'BANNER', 'LNTYPE'];
    for (const key of allKeys) {
      const upperKey = key.toUpperCase();
      if (!DISPLAY_KEYS.includes(upperKey)) continue;
      const oldVal = oldChart.headers[key] ?? '';
      const newVal = newChart.headers[key] ?? '';
      if (oldVal !== newVal) {
        changes.push({ key: upperKey, oldVal, newVal });
      }
    }
    return changes;
  }, [oldChart?.headers, newChart?.headers]);

  // Calculate per-measure change groups
  const measureChanges = useMemo<MeasureChange[]>(() => {
    const measureMap = new Map<number, MeasureChange>();

    const addToMeasure = (beat: number, type: 'added' | 'removed' | 'modified') => {
      const measure = beatToMeasure(beat);
      if (!measureMap.has(measure)) {
        measureMap.set(measure, { measure, beat: measure * 4, added: 0, removed: 0, modified: 0 });
      }
      measureMap.get(measure)![type]++;
    };

    for (const n of noteDiff.added) addToMeasure(n.beat, 'added');
    for (const n of noteDiff.removed) addToMeasure(n.beat, 'removed');
    for (const n of noteDiff.modified) addToMeasure(n.beat, 'modified');

    return Array.from(measureMap.values()).sort((a, b) => a.measure - b.measure);
  }, [noteDiff]);

  // Total change count
  const totalChanges = noteDiff.added.length + noteDiff.removed.length + noteDiff.modified.length;
  const hasNoChanges = totalChanges === 0 && headerChanges.length === 0;

  // Chart to display
  const displayChart = newChart || oldChart;
  const keyMode = displayChart?.keyMode || '7K';
  const totalBeats = displayChart?.totalBeats || 100;

  // Auto-scroll to the first change position
  useEffect(() => {
    if (measureChanges.length > 0 && scrollToBeat === undefined) {
      const firstBeat = measureChanges[0].beat;
      setScrollToBeat(firstBeat);
      setCurrentChangeIndex(0);
    }
  }, [measureChanges]);

  // Navigate between changes
  const navigateToChange = useCallback((index: number) => {
    if (measureChanges.length === 0) return;
    const clamped = Math.max(0, Math.min(measureChanges.length - 1, index));
    setCurrentChangeIndex(clamped);
    const beat = measureChanges[clamped].beat;
    setScrollToBeat(beat);
    setSplitScrollToBeat(beat);

    // Scroll to the corresponding item in the sidebar
    const el = sidebarRef.current?.querySelector(`[data-measure="${measureChanges[clamped].measure}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [measureChanges]);

  const goToPrevChange = useCallback(() => navigateToChange(currentChangeIndex - 1), [currentChangeIndex, navigateToChange]);
  const goToNextChange = useCallback(() => navigateToChange(currentChangeIndex + 1), [currentChangeIndex, navigateToChange]);

  // Keyboard shortcuts (F7/F8)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F7') { e.preventDefault(); goToPrevChange(); }
      if (e.key === 'F8') { e.preventDefault(); goToNextChange(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goToPrevChange, goToNextChange]);

  const effectiveHeight = viewerHeight ?? 600;

  // No-changes state
  if (hasNoChanges) {
    return (
      <div
        className={cn('rounded-lg border border-zinc-800 bg-[#1a1a2e]', className)}
        role="region"
        aria-label={t('diff.ariaLabel')}
      >
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <Check className="w-12 h-12 mb-4 text-green-500" />
          <p className="text-lg font-medium text-zinc-200">{t('diff.noChanges.title')}</p>
          <p className="text-sm mt-1">{t('diff.noChanges.detail')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('rounded-lg border border-zinc-800 bg-[#1a1a2e] flex flex-col', className)}
      role="dialog"
      aria-modal="true"
      aria-label={t('diff.ariaLabel')}
    >
      {/* ===== TOP BAR ===== */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 flex-shrink-0">
        {/* Left: Summary */}
        <div className="flex items-center gap-3">
          {/* Change type badge */}
          {changeType === 'added' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-600 text-white">
              <Plus className="w-3 h-3" /> Added
            </span>
          )}
          {changeType === 'deleted' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-600 text-white">
              <Minus className="w-3 h-3" /> Deleted
            </span>
          )}
          {changeType === 'modified' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-zinc-600 text-white">
              <RefreshCw className="w-3 h-3" /> Modified
            </span>
          )}
          <span className="text-xs text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded">
            {KEY_MODE_DISPLAY[keyMode]}
          </span>

          {/* Note change summary */}
          <div className="text-xs text-zinc-400 flex items-center gap-2">
            {noteDiff.added.length > 0 && <span className="text-green-400">+{noteDiff.added.length}</span>}
            {noteDiff.removed.length > 0 && <span className="text-red-400">-{noteDiff.removed.length}</span>}
            {noteDiff.modified.length > 0 && <span className="text-yellow-400">~{noteDiff.modified.length}</span>}
            <span className="text-zinc-500">
              {t('diff.measureCount', { count: measureChanges.length })}
            </span>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Stats */}
          <div className="flex items-center gap-3 mr-2 text-xs">
            <StatChange label="Notes" diff={statsDiff.total} newValue={newChart?.stats.total} />
            <StatChange label="Scratch" diff={statsDiff.scratch} newValue={newChart?.stats.scratch} />
            <StatChange label="LN" diff={statsDiff.longNotes} newValue={newChart?.stats.longNotes} />
          </div>

          {/* Separator */}
          <div className="w-px h-4 bg-zinc-700" />

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={goToPrevChange}
              disabled={currentChangeIndex <= 0}
              className="p-1 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400"
              title={t('diff.nav.prevTooltip')}
              aria-label={t('diff.nav.prev')}
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <span className="text-xs text-zinc-400 min-w-[3rem] text-center tabular-nums">
              {measureChanges.length > 0 ? `${currentChangeIndex + 1}/${measureChanges.length}` : '0/0'}
            </span>
            <button
              onClick={goToNextChange}
              disabled={currentChangeIndex >= measureChanges.length - 1}
              className="p-1 rounded hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400"
              title={t('diff.nav.nextTooltip')}
              aria-label={t('diff.nav.next')}
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Separator */}
          <div className="w-px h-4 bg-zinc-700" />

          {/* Filter toggle */}
          <button
            onClick={() => setShowChangesOnly(v => !v)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
              showChangesOnly ? 'bg-blue-600/20 text-blue-400' : 'text-zinc-400 hover:bg-zinc-700'
            )}
            title={t('diff.filter.changesOnlyTooltip')}
            aria-pressed={showChangesOnly}
          >
            {showChangesOnly ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {t('diff.filter.changesOnlyShort')}
          </button>

          {/* View mode tabs */}
          <div className="flex rounded overflow-hidden border border-zinc-700" role="tablist" aria-label={t('diff.viewModeAria')}>
            <button
              role="tab"
              aria-selected={viewMode === 'unified'}
              onClick={() => setViewMode('unified')}
              className={cn(
                'px-3 py-1 text-xs transition-colors',
                viewMode === 'unified' ? 'bg-zinc-600 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'
              )}
            >
              Unified
            </button>
            <button
              role="tab"
              aria-selected={viewMode === 'split'}
              onClick={() => setViewMode('split')}
              className={cn(
                'px-3 py-1 text-xs transition-colors',
                viewMode === 'split' ? 'bg-zinc-600 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'
              )}
            >
              Split
            </button>
          </div>
        </div>
      </div>

      {/* ===== HEADER CHANGES ===== */}
      {headerChanges.length > 0 && (
        <div className="px-4 py-2 border-b border-zinc-800 flex-shrink-0">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            {headerChanges.map(({ key, oldVal, newVal }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="font-mono text-zinc-500 w-20 flex-shrink-0">#{key}</span>
                {oldVal && (
                  <span className="text-red-400 line-through truncate max-w-[120px]" title={oldVal}>
                    {oldVal}
                  </span>
                )}
                {oldVal && newVal && <span className="text-zinc-600">&rarr;</span>}
                {newVal && (
                  <span className="text-green-400 truncate max-w-[120px]" title={newVal}>
                    {newVal}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== MAIN CONTENT: SIDEBAR + CHART ===== */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar: Change list by measure */}
        {measureChanges.length > 0 && (
          <div
            ref={sidebarRef}
            className="w-52 flex-shrink-0 border-r border-zinc-800 overflow-y-auto"
            style={{ maxHeight: effectiveHeight }}
          >
            <div className="sticky top-0 bg-[#1a1a2e] border-b border-zinc-800 px-3 py-1.5 text-xs text-zinc-500 font-medium">
              {t('diff.sidebar.heading')}
            </div>
            {measureChanges.map((mc, idx) => (
              <button
                key={mc.measure}
                data-measure={mc.measure}
                onClick={() => navigateToChange(idx)}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors border-l-2',
                  idx === currentChangeIndex
                    ? 'bg-zinc-800/80 border-l-blue-500 text-zinc-200'
                    : 'border-l-transparent text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-300'
                )}
                aria-current={idx === currentChangeIndex ? 'true' : undefined}
              >
                <span className="font-mono">{t('diff.sidebar.measureLabel', { measure: mc.measure + 1 })}</span>
                <span className="flex items-center gap-1.5">
                  {mc.added > 0 && <span className="text-green-400">+{mc.added}</span>}
                  {mc.removed > 0 && <span className="text-red-400">-{mc.removed}</span>}
                  {mc.modified > 0 && <span className="text-yellow-400">~{mc.modified}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Chart viewer area */}
        <div className="flex-1 min-w-0">
          {/* Legend */}
          {changeType === 'modified' && totalChanges > 0 && (
            <div className="flex items-center gap-4 px-3 py-1.5 border-b border-zinc-800 text-xs text-zinc-500">
              {noteDiff.added.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-sm bg-green-500 inline-block" />
                  {t('diff.legend.added', { count: noteDiff.added.length })}
                </span>
              )}
              {noteDiff.removed.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-sm bg-red-500 inline-block" />
                  {t('diff.legend.removed', { count: noteDiff.removed.length })}
                </span>
              )}
              {noteDiff.modified.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-sm bg-yellow-500 inline-block" />
                  {t('diff.legend.modified', { count: noteDiff.modified.length })}
                </span>
              )}
              {showChangesOnly && (
                <span className="text-blue-400 ml-auto">{t('diff.legend.unchangedDimmed')}</span>
              )}
            </div>
          )}

          {/* Unified view */}
          {viewMode === 'unified' && displayChart && (
            <NoteChartViewer
              notes={displayChart.notes}
              keyMode={keyMode}
              totalBeats={totalBeats}
              height={effectiveHeight}
              diffMode={changeType === 'modified'}
              addedNotes={noteDiff.added}
              removedNotes={noteDiff.removed}
              modifiedNotes={noteDiff.modified}
              scrollToBeat={scrollToBeat}
              unchangedOpacity={showChangesOnly ? 0.15 : undefined}
            />
          )}

          {/* Split view */}
          {viewMode === 'split' && (
            <div className="grid grid-cols-2 h-full">
              <div className="border-r border-zinc-800">
                <div className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-zinc-500 border-b border-zinc-800 bg-red-500/5">
                  <GitBranch className="w-3 h-3" />
                  Before
                </div>
                {oldChart ? (
                  <NoteChartViewer
                    notes={oldChart.notes}
                    keyMode={oldChart.keyMode}
                    totalBeats={oldChart.totalBeats}
                    height={effectiveHeight - 28}
                    scrollToBeat={splitScrollToBeat}
                  />
                ) : (
                  <div className="flex items-center justify-center text-zinc-500 text-sm" style={{ height: effectiveHeight - 28 }}>
                    {t('diff.empty.before')}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-zinc-500 border-b border-zinc-800 bg-green-500/5">
                  <GitBranch className="w-3 h-3" />
                  After
                </div>
                {newChart ? (
                  <NoteChartViewer
                    notes={newChart.notes}
                    keyMode={newChart.keyMode}
                    totalBeats={newChart.totalBeats}
                    height={effectiveHeight - 28}
                    diffMode={changeType === 'modified'}
                    addedNotes={noteDiff.added}
                    removedNotes={noteDiff.removed}
                    modifiedNotes={noteDiff.modified}
                    scrollToBeat={splitScrollToBeat}
                    unchangedOpacity={showChangesOnly ? 0.15 : undefined}
                  />
                ) : (
                  <div className="flex items-center justify-center text-zinc-500 text-sm" style={{ height: effectiveHeight - 28 }}>
                    {t('diff.empty.after')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Component displaying a stat change value
 */
function StatChange({
  label,
  diff,
  newValue = 0,
}: {
  label: string;
  diff: number;
  newValue?: number;
}) {
  return (
    <span>
      <span className="text-zinc-500">{label}:</span>{' '}
      <span className="font-medium text-zinc-300">{newValue}</span>
      {diff !== 0 && (
        <span className={cn('ml-1', diff > 0 ? 'text-green-400' : 'text-red-400')}>
          ({diff > 0 ? '+' : ''}{diff})
        </span>
      )}
    </span>
  );
}

export default BmsChartDiff;
