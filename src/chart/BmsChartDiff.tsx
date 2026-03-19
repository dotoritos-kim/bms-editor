/**
 * BmsChartDiff Component
 *
 * BMS 차트의 변경사항을 시각적으로 비교하는 컴포넌트
 * 커밋이나 풀 리퀘스트에서 차트 변경사항을 표시할 때 사용
 */

import { useMemo, useState } from 'react';
import { GitBranch, Plus, Minus, RefreshCw, Music } from 'lucide-react';
import { NoteChartViewer, KEY_MODE_DISPLAY } from './NoteChartViewer';
import type { KeyMode } from './NoteChartViewer';
import type { BMSNote } from '@rhythm-archive/bms-core';
import { cn } from '../utils';

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
  /** 헤더 정보 (선택적, diff 표시용) */
  headers?: Record<string, string>;
}

export interface BmsChartDiffProps {
  /** 이전 버전 차트 정보 (null이면 새로 추가됨) */
  oldChart: ChartInfo | null;
  /** 새 버전 차트 정보 (null이면 삭제됨) */
  newChart: ChartInfo | null;
  /** 파일 경로 */
  filePath: string;
  /** 추가 클래스명 */
  className?: string;
}

/**
 * 노트 비교를 위한 키 생성
 */
function getNoteKey(note: BMSNote): string {
  return `${note.beat.toFixed(4)}-${note.column || 'bgm'}-${note.keysound}`;
}

/**
 * 두 차트의 노트 차이 계산 (수정 노트 감지 포함)
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

  // 수정 감지: removed+added 중 같은 위치 or 같은 column+키음 매칭
  const modified: BMSNote[] = [];
  const matchedRemovedIds = new Set<number>();
  const matchedAddedIds = new Set<number>();

  for (let ai = 0; ai < rawAdded.length; ai++) {
    const added = rawAdded[ai];
    for (let ri = 0; ri < rawRemoved.length; ri++) {
      if (matchedRemovedIds.has(ri)) continue;
      const removed = rawRemoved[ri];

      // 같은 컬럼 + 비트 근접 (2비트 이내) → 이동됨
      const sameColumn = added.column === removed.column && added.column !== undefined;
      const nearBeat = Math.abs(added.beat - removed.beat) < 2;
      // 같은 위치 + 다른 키음 → 키음 변경
      const samePosition = Math.abs(added.beat - removed.beat) < 0.001 && added.column === removed.column;
      const differentKeysound = added.keysound !== removed.keysound;

      if ((sameColumn && nearBeat) || (samePosition && differentKeysound)) {
        modified.push(added); // 새 버전 노트를 modified로 표시
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
 * BMS 차트 Diff 컴포넌트
 */
export function BmsChartDiff({
  oldChart,
  newChart,
  filePath,
  className,
}: BmsChartDiffProps) {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  // 변경 유형 결정
  const changeType = useMemo(() => {
    if (!oldChart && newChart) return 'added';
    if (oldChart && !newChart) return 'deleted';
    return 'modified';
  }, [oldChart, newChart]);

  // 노트 차이 계산
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

  // 통계 변화 계산
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

  // 헤더 변경 감지
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

  // 파일 이름 추출
  const fileName = filePath.split('/').pop() || filePath;

  // 현재 표시할 차트 결정
  const displayChart = newChart || oldChart;
  const keyMode = displayChart?.keyMode || '7K';
  const totalBeats = displayChart?.totalBeats || 100;

  const badgeStyle = (variant: 'added' | 'deleted' | 'modified' | 'outline'): React.CSSProperties => {
    switch (variant) {
      case 'added': return { display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, backgroundColor: '#16a34a', color: '#fff' };
      case 'deleted': return { display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, backgroundColor: '#dc2626', color: '#fff' };
      case 'modified': return { display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, backgroundColor: '#6b7280', color: '#fff' };
      case 'outline': return { display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, border: '1px solid #6b7280', color: '#9ca3af' };
    }
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: active ? '#e5e7eb' : '#9ca3af',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: active ? '#3b82f6' : 'transparent',
  });

  return (
    <div className={cn('overflow-hidden border rounded-lg', className)} style={{ background: '#1a1a2e' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Music style={{ width: 20, height: 20, color: '#9ca3af' }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{fileName}</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>{filePath}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {changeType === 'added' && (
            <span style={badgeStyle('added')}>
              <Plus style={{ width: 12, height: 12, marginRight: 4 }} />
              Added
            </span>
          )}
          {changeType === 'deleted' && (
            <span style={badgeStyle('deleted')}>
              <Minus style={{ width: 12, height: 12, marginRight: 4 }} />
              Deleted
            </span>
          )}
          {changeType === 'modified' && (
            <span style={badgeStyle('modified')}>
              <RefreshCw style={{ width: 12, height: 12, marginRight: 4 }} />
              Modified
            </span>
          )}
          <span style={badgeStyle('outline')}>{KEY_MODE_DISPLAY[keyMode]}</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {/* Stats summary */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.05)' }}>
          <StatChange label="Notes" diff={statsDiff.total} newValue={newChart?.stats.total} />
          <StatChange label="Scratch" diff={statsDiff.scratch} newValue={newChart?.stats.scratch} />
          <StatChange label="Long Notes" diff={statsDiff.longNotes} newValue={newChart?.stats.longNotes} />
          {(oldChart?.stats.landmines || newChart?.stats.landmines || 0) > 0 && (
            <StatChange label="Landmines" diff={statsDiff.landmines} newValue={newChart?.stats.landmines} />
          )}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            <span style={{ color: '#22c55e' }}>+{noteDiff.added.length}</span>
            {' / '}
            <span style={{ color: '#ef4444' }}>-{noteDiff.removed.length}</span>
            {noteDiff.modified.length > 0 && (
              <>
                {' / '}
                <span style={{ color: '#eab308' }}>~{noteDiff.modified.length}</span>
              </>
            )}
            {' notes'}
          </div>
        </div>

        {/* Diff color legend */}
        {changeType === 'modified' && (noteDiff.added.length > 0 || noteDiff.removed.length > 0 || noteDiff.modified.length > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, fontSize: 12, color: '#9ca3af' }}>
            {noteDiff.added.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 8, borderRadius: 2, background: '#22c55e', display: 'inline-block' }} />
                Added ({noteDiff.added.length})
              </span>
            )}
            {noteDiff.removed.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 8, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} />
                Removed ({noteDiff.removed.length})
              </span>
            )}
            {noteDiff.modified.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 8, borderRadius: 2, background: '#eab308', display: 'inline-block' }} />
                Modified ({noteDiff.modified.length})
              </span>
            )}
          </div>
        )}

        {/* Header changes */}
        {headerChanges.length > 0 && (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#9ca3af', marginBottom: 4 }}>Header Changes</p>
            {headerChanges.map(({ key, oldVal, newVal }) => (
              <div key={key} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'monospace', color: '#9ca3af', width: 80, flexShrink: 0 }}>#{key}</span>
                {oldVal && (
                  <span style={{ color: '#ef4444', textDecoration: 'line-through', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={oldVal}>
                    {oldVal}
                  </span>
                )}
                {oldVal && newVal && <span style={{ color: '#9ca3af' }}>&rarr;</span>}
                {newVal && (
                  <span style={{ color: '#22c55e', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={newVal}>
                    {newVal}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* View mode tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #333' }}>
          <button style={tabBtnStyle(viewMode === 'unified')} onClick={() => setViewMode('unified')}>Unified</button>
          <button style={tabBtnStyle(viewMode === 'split')} onClick={() => setViewMode('split')}>Split</button>
        </div>

        {/* Unified view */}
        {viewMode === 'unified' && displayChart && (
          <NoteChartViewer
            notes={displayChart.notes}
            keyMode={keyMode}
            totalBeats={totalBeats}
            height={400}
            diffMode={changeType === 'modified'}
            addedNotes={noteDiff.added}
            removedNotes={noteDiff.removed}
            modifiedNotes={noteDiff.modified}
          />
        )}

        {/* Split view */}
        {viewMode === 'split' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#9ca3af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <GitBranch style={{ width: 12, height: 12 }} />
                Before
              </div>
              {oldChart ? (
                <NoteChartViewer
                  notes={oldChart.notes}
                  keyMode={oldChart.keyMode}
                  totalBeats={oldChart.totalBeats}
                  height={300}
                />
              ) : (
                <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid #333', background: 'rgba(255,255,255,0.03)', color: '#9ca3af', fontSize: 14 }}>
                  File not present
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#9ca3af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <GitBranch style={{ width: 12, height: 12 }} />
                After
              </div>
              {newChart ? (
                <NoteChartViewer
                  notes={newChart.notes}
                  keyMode={newChart.keyMode}
                  totalBeats={newChart.totalBeats}
                  height={300}
                />
              ) : (
                <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid #333', background: 'rgba(255,255,255,0.03)', color: '#9ca3af', fontSize: 14 }}>
                  File deleted
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 통계 변화 표시 컴포넌트
 */
function StatChange({
  label,
  diff,
  newValue = 0,
}: {
  label: string;
  diff: number;
  oldValue?: number;
  newValue?: number;
}) {
  return (
    <div style={{ fontSize: 12 }}>
      <span style={{ color: '#9ca3af' }}>{label}:</span>{' '}
      <span style={{ fontWeight: 500 }}>{newValue}</span>
      {diff !== 0 && (
        <span style={{ marginLeft: 4, color: diff > 0 ? '#22c55e' : '#ef4444' }}>
          ({diff > 0 ? '+' : ''}{diff})
        </span>
      )}
    </div>
  );
}

export default BmsChartDiff;
