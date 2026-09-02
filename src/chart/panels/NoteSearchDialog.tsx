/**
 * NoteSearchDialog
 *
 * Note search dialog for the chart editor.
 * Opened with Ctrl+F. Search and select notes by measure, keysound, column, and type.
 *
 * Uses plain HTML/CSS instead of Radix UI primitives for standalone usage.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useI18n } from '../../i18n';
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

const NOTE_TYPE_OPTIONS = [
  { value: 'all', labelKey: 'panels.noteSearch.types.all' },
  { value: 'playable', labelKey: 'panels.noteSearch.types.playable' },
  { value: 'invisible', labelKey: 'panels.noteSearch.types.invisible' },
  { value: 'landmine', labelKey: 'panels.noteSearch.types.landmine' },
  { value: 'bgm', labelKey: 'panels.noteSearch.types.bgm' },
] as const;

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
  const { t } = useI18n();
  // Filter state
  const [measureFrom, setMeasureFrom] = useState('');
  const [measureTo, setMeasureTo] = useState('');
  const [keysoundQuery, setKeysoundQuery] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [noteTypeFilter, setNoteTypeFilter] = useState('all');

  const laneConfigs = useMemo(() => generateLaneConfig(keyMode, 1), [keyMode]);

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

  // Escape closes the dialog (previously only a backdrop click could).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-search-title"
        style={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Search style={{ width: 16, height: 16 }} />
          <h3 id="note-search-title" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{t('panels.noteSearch.title')}</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Measure range */}
          <div>
            <label style={labelStyle}>{t('panels.noteSearch.measureRange')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" min={1} placeholder={t('panels.noteSearch.measureFrom')} value={measureFrom} onChange={(e) => setMeasureFrom(e.target.value)} style={inputStyle} />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>~</span>
              <input type="number" min={1} placeholder={t('panels.noteSearch.measureTo')} value={measureTo} onChange={(e) => setMeasureTo(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Keysound search */}
          <div>
            <label style={labelStyle}>{t('panels.noteSearch.keysoundLabel')}</label>
            <input placeholder={t('panels.noteSearch.keysoundPlaceholder')} value={keysoundQuery} onChange={(e) => setKeysoundQuery(e.target.value)} style={inputStyle} />
          </div>

          {/* Column selection */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={labelStyle}>{t('panels.noteSearch.columnLabel')}</label>
              <button onClick={toggleAllColumns} style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
                {selectedColumns.size === laneConfigs.length ? t('panels.noteSearch.deselectAllColumns') : t('panels.noteSearch.selectAllColumns')}
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
            <label style={labelStyle}>{t('panels.noteSearch.noteTypeLabel')}</label>
            <select
              value={noteTypeFilter}
              onChange={(e) => setNoteTypeFilter(e.target.value as NoteType | 'all')}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {NOTE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Results */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #333' }}>
            <div style={{ fontSize: 14 }}>
              {hasFilters ? (
                <span style={{ fontWeight: 600, color: '#fb923c' }}>
                  {t('panels.noteSearch.results', { count: matchingNotes.length })}
                </span>
              ) : (
                <span style={{ color: '#9ca3af' }}>
                  {t('panels.noteSearch.total', { count: notes.length })}
                </span>
              )}
            </div>
            {hasFilters && (
              <button onClick={handleReset} style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
                {t('panels.noteSearch.resetFilters')}
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
              {t('panels.noteSearch.selectResults', { count: matchingNotes.length })}
            </button>
            <button
              onClick={handleGoToFirst}
              disabled={matchingNotes.length === 0}
              style={{ ...btnOutlineStyle, opacity: matchingNotes.length === 0 ? 0.5 : 1, cursor: matchingNotes.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              <Navigation style={{ width: 14, height: 14 }} />
              {t('panels.noteSearch.goToFirst')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default NoteSearchDialog;
