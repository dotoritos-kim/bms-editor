/**
 * NoteSearchDialog
 *
 * 차트 에디터 노트 검색 다이얼로그
 * Ctrl+F로 열림. 마디, 키음, 컬럼, 타입으로 노트를 검색하고 선택 가능.
 *
 * Uses plain HTML/CSS instead of Radix UI primitives for standalone usage.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Search, MousePointerClick, Navigation } from 'lucide-react';
import { cn } from '../../utils';
import { generateLaneConfig } from '../laneConfig';
import type { KeyMode } from '../NoteChartViewer';
import type { EditableBMSNote, NoteType } from '@rhythm-archive/bms-core';

interface NoteSearchDialogProps {
  open: boolean;
  onClose: () => void;
  notes: EditableBMSNote[];
  keyMode: KeyMode;
  wavDefinitions: Map<string, string>;
  onSelectNotes: (noteIds: string[]) => void;
  onNavigate: (beat: number) => void;
}

const NOTE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'playable', label: 'Playable' },
  { value: 'invisible', label: 'Invisible' },
  { value: 'landmine', label: 'Landmine' },
  { value: 'bgm', label: 'BGM' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  fontSize: 13,
  background: '#2a2a3e',
  border: '1px solid #444',
  borderRadius: 4,
  color: '#e5e7eb',
  outline: 'none',
  height: 32,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: '#e5e7eb',
  display: 'block',
  marginBottom: 4,
};

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '6px 16px',
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
  color: '#fff',
  background: '#3b82f6',
};

const btnOutlineStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'none',
  border: '1px solid #555',
  color: '#e5e7eb',
};

export const NoteSearchDialog = React.memo(function NoteSearchDialog({
  open,
  onClose,
  notes,
  keyMode,
  wavDefinitions,
  onSelectNotes,
  onNavigate,
}: NoteSearchDialogProps) {
  // Filter state
  const [measureFrom, setMeasureFrom] = useState('');
  const [measureTo, setMeasureTo] = useState('');
  const [keysoundQuery, setKeysoundQuery] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [noteTypeFilter, setNoteTypeFilter] = useState('all');

  const laneConfigs = useMemo(() => generateLaneConfig(keyMode), [keyMode]);

  const toggleColumn = useCallback((columnId: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }, []);

  const toggleAllColumns = useCallback(() => {
    setSelectedColumns((prev) => {
      if (prev.size === laneConfigs.length) return new Set();
      return new Set(laneConfigs.map((l) => l.id));
    });
  }, [laneConfigs]);

  const matchingNotes = useMemo(() => {
    return notes.filter((note) => {
      if (measureFrom !== '') {
        const fromMeasure = parseInt(measureFrom, 10);
        if (!isNaN(fromMeasure) && note.measure < fromMeasure - 1) return false;
      }
      if (measureTo !== '') {
        const toMeasure = parseInt(measureTo, 10);
        if (!isNaN(toMeasure) && note.measure > toMeasure - 1) return false;
      }
      if (keysoundQuery !== '') {
        const query = keysoundQuery.toUpperCase();
        const matchesId = note.keysound?.toUpperCase().includes(query);
        const filename = wavDefinitions.get(note.keysound?.toUpperCase() ?? '');
        const matchesFilename = filename?.toUpperCase().includes(query);
        if (!matchesId && !matchesFilename) return false;
      }
      if (selectedColumns.size > 0) {
        if (!note.column || !selectedColumns.has(note.column)) return false;
      }
      if (noteTypeFilter !== 'all') {
        const noteType = note.noteType ?? 'playable';
        if (noteType !== noteTypeFilter) return false;
      }
      return true;
    });
  }, [notes, measureFrom, measureTo, keysoundQuery, selectedColumns, noteTypeFilter, wavDefinitions]);

  const handleSelectAll = useCallback(() => {
    onSelectNotes(matchingNotes.map((n) => n.id));
  }, [matchingNotes, onSelectNotes]);

  const handleGoToFirst = useCallback(() => {
    if (matchingNotes.length === 0) return;
    const sorted = [...matchingNotes].sort((a, b) => a.beat - b.beat);
    onNavigate(sorted[0].beat);
  }, [matchingNotes, onNavigate]);

  const handleReset = useCallback(() => {
    setMeasureFrom('');
    setMeasureTo('');
    setKeysoundQuery('');
    setSelectedColumns(new Set());
    setNoteTypeFilter('all');
  }, []);

  const hasFilters = measureFrom !== '' || measureTo !== '' || keysoundQuery !== '' || selectedColumns.size > 0 || noteTypeFilter !== 'all';

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Search style={{ width: 16, height: 16 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Note Search</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Measure range */}
          <div>
            <label style={labelStyle}>Measure Range</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" min={1} placeholder="Start" value={measureFrom} onChange={(e) => setMeasureFrom(e.target.value)} style={inputStyle} />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>~</span>
              <input type="number" min={1} placeholder="End" value={measureTo} onChange={(e) => setMeasureTo(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Keysound search */}
          <div>
            <label style={labelStyle}>Keysound (WAV ID / Filename)</label>
            <input placeholder="e.g., 01, kick, snare..." value={keysoundQuery} onChange={(e) => setKeysoundQuery(e.target.value)} style={inputStyle} />
          </div>

          {/* Column selection */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={labelStyle}>Column (Lane)</label>
              <button onClick={toggleAllColumns} style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
                {selectedColumns.size === laneConfigs.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {laneConfigs.map((lane) => (
                <button
                  key={lane.id}
                  onClick={() => toggleColumn(lane.id)}
                  className={cn(
                    'px-2 py-1 rounded text-xs font-mono transition-colors border',
                    selectedColumns.has(lane.id)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                  )}
                >
                  {lane.id}
                </button>
              ))}
            </div>
          </div>

          {/* Note type */}
          <div>
            <label style={labelStyle}>Note Type</label>
            <select
              value={noteTypeFilter}
              onChange={(e) => setNoteTypeFilter(e.target.value as NoteType | 'all')}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {NOTE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Results */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #333' }}>
            <div style={{ fontSize: 14 }}>
              {hasFilters ? (
                <span>
                  Results: <span style={{ fontWeight: 600, color: '#fb923c' }}>{matchingNotes.length}</span> notes
                </span>
              ) : (
                <span style={{ color: '#9ca3af' }}>
                  Total {notes.length} notes
                </span>
              )}
            </div>
            {hasFilters && (
              <button onClick={handleReset} style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
                Reset Filters
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSelectAll}
              disabled={matchingNotes.length === 0}
              style={{ ...btnStyle, flex: 1, opacity: matchingNotes.length === 0 ? 0.5 : 1, cursor: matchingNotes.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              <MousePointerClick style={{ width: 14, height: 14 }} />
              Select All ({matchingNotes.length})
            </button>
            <button
              onClick={handleGoToFirst}
              disabled={matchingNotes.length === 0}
              style={{ ...btnOutlineStyle, opacity: matchingNotes.length === 0 ? 0.5 : 1, cursor: matchingNotes.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              <Navigation style={{ width: 14, height: 14 }} />
              Go to First
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default NoteSearchDialog;
