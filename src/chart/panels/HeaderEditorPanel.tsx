/**
 * HeaderEditorPanel
 *
 * BMS 차트 헤더 편집 패널
 * 탭: 기본 | 커스텀 | WAV | BMP | Raw
 * - 기본: title/artist/genre/bpm 등 표준 헤더 + player/backbmp/lntype/lnobj
 * - 커스텀: custom Map (임의 #KEY VALUE) 추가/편집/삭제
 * - WAV: #WAVxx 정의 편집
 * - BMP: #BMPxx 정의 편집
 * - Raw: 전체 헤더 텍스트 직접 편집 후 일괄 적용
 * - 검색: 각 탭 상단 필터
 */

import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '../../utils';
import { useI18n } from '../../i18n';
import type { EditableBMSChart, BMSHeaderData } from '@rhythm-archive/bms-core';
import { FilePickerCombobox } from './FilePickerCombobox';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function headersToRawText(headers: BMSHeaderData): string {
  const lines: string[] = [];
  const stdFields: [string, unknown][] = [
    ['PLAYER', headers.player],
    ['GENRE', headers.genre],
    ['TITLE', headers.title],
    ['SUBTITLE', headers.subtitle],
    ['ARTIST', headers.artist],
    ['SUBARTIST', headers.subartist],
    ['BPM', headers.bpm],
    ['PLAYLEVEL', headers.playlevel],
    ['RANK', headers.rank],
    ['TOTAL', headers.total],
    ['DIFFICULTY', headers.difficulty],
    ['STAGEFILE', headers.stagefile],
    ['BANNER', headers.banner],
    ['BACKBMP', headers.backbmp],
    ['LNTYPE', headers.lntype],
    ['LNOBJ', headers.lnobj],
  ];
  for (const [key, value] of stdFields) {
    if (value !== undefined && value !== null && value !== '') {
      lines.push(`#${key} ${value}`);
    }
  }
  for (const [key, value] of headers.custom) {
    if (value) lines.push(`#${key} ${value}`);
  }
  if (headers.bpmDef.size > 0 || headers.stopDef.size > 0) {
    lines.push('');
    for (const [key, value] of [...headers.bpmDef.entries()].sort()) {
      lines.push(`#BPM${key} ${value}`);
    }
    for (const [key, value] of [...headers.stopDef.entries()].sort()) {
      lines.push(`#STOP${key} ${value}`);
    }
  }
  if (headers.wav.size > 0) {
    lines.push('');
    for (const [key, value] of [...headers.wav.entries()].sort()) {
      if (value) lines.push(`#WAV${key} ${value}`);
    }
  }
  if (headers.bmp.size > 0) {
    lines.push('');
    for (const [key, value] of [...headers.bmp.entries()].sort()) {
      if (value) lines.push(`#BMP${key} ${value}`);
    }
  }
  return lines.join('\n').trimEnd();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeaderEditorPanelProps {
  chart: EditableBMSChart;
  onHeaderChange: (field: string, value: string | number) => void;
  onCustomHeaderSet?: (key: string, value: string) => void;
  onCustomHeaderDelete?: (key: string) => void;
  onWavDefSet?: (key: string, value: string) => void;
  onWavDefDelete?: (key: string) => void;
  onBmpDefSet?: (key: string, value: string) => void;
  onBmpDefDelete?: (key: string) => void;
  onRawApply?: (raw: string) => void;
  readOnly?: boolean;
  imageFiles?: string[];
  className?: string;
}

type TabKey = 'basic' | 'custom' | 'wav' | 'bmp' | 'raw';

interface SelectOption { value: number; label: string; }
interface HeaderField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  placeholder?: string;
  options?: SelectOption[];
  filePicker?: boolean;
}

const RANK_OPTIONS: SelectOption[] = [
  { value: 0, label: '0 - VERY HARD' },
  { value: 1, label: '1 - HARD' },
  { value: 2, label: '2 - NORMAL' },
  { value: 3, label: '3 - EASY' },
];

const DIFFICULTY_OPTIONS: SelectOption[] = [
  { value: 1, label: '1 - BEGINNER' },
  { value: 2, label: '2 - NORMAL' },
  { value: 3, label: '3 - HYPER' },
  { value: 4, label: '4 - ANOTHER' },
  { value: 5, label: '5 - INSANE' },
];

const PLAYER_OPTIONS: SelectOption[] = [
  { value: 1, label: '1 - 1P' },
  { value: 2, label: '2 - 2P' },
  { value: 3, label: '3 - DOUBLE' },
];

const HEADER_FIELDS: HeaderField[] = [
  { key: 'title',      label: '제목',       type: 'text',   placeholder: 'Title' },
  { key: 'subtitle',   label: '부제목',     type: 'text',   placeholder: 'Subtitle' },
  { key: 'artist',     label: '아티스트',   type: 'text',   placeholder: 'Artist' },
  { key: 'subartist',  label: '부 아티스트', type: 'text',  placeholder: 'Subartist' },
  { key: 'genre',      label: '장르',       type: 'text',   placeholder: 'Genre' },
  { key: 'bpm',        label: 'BPM',        type: 'number', placeholder: '130' },
  { key: 'playlevel',  label: '레벨',       type: 'number', placeholder: '1' },
  { key: 'difficulty', label: '난이도',     type: 'select', options: DIFFICULTY_OPTIONS },
  { key: 'rank',       label: '판정',       type: 'select', options: RANK_OPTIONS },
  { key: 'total',      label: 'Total',      type: 'number', placeholder: '300' },
  { key: 'player',     label: 'Player',     type: 'select', options: PLAYER_OPTIONS },
  { key: 'stagefile',  label: 'Stage File', type: 'text',   placeholder: 'stagefile.bmp', filePicker: true },
  { key: 'banner',     label: 'Banner',     type: 'text',   placeholder: 'banner.bmp',    filePicker: true },
  { key: 'backbmp',    label: 'Back BMP',   type: 'text',   placeholder: 'back.bmp',      filePicker: true },
  { key: 'lntype',     label: 'LN Type',    type: 'number', placeholder: '1' },
  { key: 'lnobj',      label: 'LNOBJ',      type: 'text',   placeholder: 'ZZ' },
];

// ---------------------------------------------------------------------------
// MapEditor — shared UI for custom / WAV / BMP tabs
// ---------------------------------------------------------------------------

interface MapEditorProps {
  entries: Map<string, string | number>;
  keyPrefix?: string;
  search: string;
  readOnly?: boolean;
  onSet?: (key: string, value: string) => void;
  onDelete?: (key: string) => void;
  addKey: string;
  addValue: string;
  onAddKeyChange: (v: string) => void;
  onAddValueChange: (v: string) => void;
  onAdd: () => void;
}

function MapEditor({
  entries, keyPrefix = '', search, readOnly,
  onSet, onDelete,
  addKey, addValue, onAddKeyChange, onAddValueChange, onAdd,
}: MapEditorProps) {
  const { t } = useI18n();
  // WAV/BMP 키는 BMS 스펙상 2자 이상 (예: "01", "ZZ")
  const minKeyLen = keyPrefix ? 2 : 1;
  const isKeyValid = addKey.trim().length >= minKeyLen;
  const q = search.toLowerCase();
  const filtered = [...entries.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([k, v]) => !q || k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q));

  return (
    <div className="flex flex-col">
      {filtered.length === 0 && (
        <div className="px-3 py-5 text-xs text-muted-foreground text-center">
          {search ? t('panels.header.common.noSearchResults') : t('panels.header.common.empty')}
        </div>
      )}
      {filtered.map(([key, value]) => (
        <div key={key} className="flex items-center gap-1 px-2 py-0.5 hover:bg-muted/30 group">
          <span className="text-xs text-muted-foreground w-9 shrink-0 font-mono truncate" title={keyPrefix + key}>
            {keyPrefix}{key}
          </span>
          <input
            key={key + ':' + String(value)}
            type="text"
            defaultValue={String(value)}
            readOnly={readOnly}
            className="flex-1 min-w-0 px-1 py-0.5 text-xs bg-transparent focus:bg-muted rounded outline-none focus:ring-1 focus:ring-primary"
            onBlur={(e) => {
              if (!readOnly && e.target.value !== String(value)) {
                onSet?.(key, e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                (e.target as HTMLInputElement).value = String(value);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {!readOnly && (
            <button
              onClick={() => onDelete?.(key)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity px-0.5 text-sm leading-none shrink-0"
              title={t('panels.header.common.deleteTooltip')}
            >×</button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="border-t mt-1 px-2 py-1.5 flex gap-1">
          <input
            type="text"
            value={addKey}
            onChange={(e) => onAddKeyChange(e.target.value.toUpperCase())}
            placeholder={keyPrefix ? '01' : 'KEY'}
            className="w-12 px-1 py-0.5 text-xs bg-muted rounded font-mono outline-none focus:ring-1 focus:ring-primary"
            onKeyDown={(e) => { if (e.key === 'Enter' && isKeyValid) onAdd(); }}
          />
          <input
            type="text"
            value={addValue}
            onChange={(e) => onAddValueChange(e.target.value)}
            placeholder={t('panels.header.common.valuePlaceholder')}
            className="flex-1 min-w-0 px-1 py-0.5 text-xs bg-muted rounded outline-none focus:ring-1 focus:ring-primary"
            onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
          />
          <button
            onClick={onAdd}
            disabled={!isKeyValid}
            className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-40 shrink-0"
          >+</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const HeaderEditorPanel = React.memo(function HeaderEditorPanel({
  chart,
  onHeaderChange,
  onCustomHeaderSet,
  onCustomHeaderDelete,
  onWavDefSet,
  onWavDefDelete,
  onBmpDefSet,
  onBmpDefDelete,
  onRawApply,
  readOnly = false,
  imageFiles,
  className,
}: HeaderEditorPanelProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabKey>('basic');
  const [search, setSearch] = useState('');
  const [rawText, setRawText] = useState('');
  const [addKey, setAddKey] = useState('');
  const [addValue, setAddValue] = useState('');

  // Field labels are derived from the i18n provider; memoize so identity is
  // stable across renders unless the locale changes.
  const fieldLabel = useCallback(
    (key: string, fallback: string): string => {
      const translated = t(`panels.header.fields.${key}` as never);
      // The fallback path returns the raw key when missing; in that case use
      // the literal English fallback supplied at the call site.
      return translated === `panels.header.fields.${key}` ? fallback : translated;
    },
    [t],
  );

  // HEADER_FIELDS is module-level (immutable label literals are English fallbacks).
  // Keep that array as-is; resolve labels through `fieldLabel(field.key, field.label)`.
  void useMemo;

  const switchTab = useCallback((tab: TabKey) => {
    if (tab === 'raw') setRawText(headersToRawText(chart.headers));
    setActiveTab(tab);
    setSearch('');
    setAddKey('');
    setAddValue('');
  }, [chart.headers]);

  const getHeaderValue = useCallback((key: string): string => {
    // BMSHeaderData has named fields only; narrowing via keyof allows safe access
    // without an unsafe double-cast.
    type ScalarHeaderKey = keyof { [K in keyof BMSHeaderData as BMSHeaderData[K] extends string | number | undefined ? K : never]: BMSHeaderData[K] };
    const v = (chart.headers as Pick<BMSHeaderData, ScalarHeaderKey>)[key as ScalarHeaderKey];
    return v === undefined || v === null ? '' : String(v);
  }, [chart.headers]);

  const handleBasicChange = useCallback((field: HeaderField, value: string) => {
    if (readOnly) return;
    if (field.type === 'number' || field.type === 'select') {
      if (value === '' || value === '--') { onHeaderChange(field.key, ''); return; }
      const num = parseFloat(value);
      if (!isNaN(num)) onHeaderChange(field.key, num);
    } else {
      onHeaderChange(field.key, value);
    }
  }, [onHeaderChange, readOnly]);

  const inputCn = cn(
    'w-full px-2 py-1 text-sm bg-muted rounded border-0 outline-none focus:ring-1 focus:ring-primary',
    readOnly && 'opacity-60 cursor-not-allowed'
  );

  const q = search.toLowerCase();
  const filteredBasic = HEADER_FIELDS.filter(
    (f) => !q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)
      || getHeaderValue(f.key).toLowerCase().includes(q)
  );

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: 'basic',  label: t('panels.header.tabs.basic') },
    { key: 'custom', label: t('panels.header.tabs.custom'), count: chart.headers.custom.size },
    { key: 'wav',    label: t('panels.header.tabs.wav'),    count: chart.headers.wav.size },
    { key: 'bmp',    label: t('panels.header.tabs.bmp'),    count: chart.headers.bmp.size },
    { key: 'raw',    label: t('panels.header.tabs.raw') },
  ];

  return (
    <div className={cn('flex flex-col h-full', className)}>

      {/* ── 탭 바 ── */}
      <div className="flex border-b shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={cn(
              'flex-1 py-1.5 text-xs transition-colors',
              activeTab === t.key
                ? 'text-foreground border-b-2 border-primary -mb-px font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-0.5 text-xs opacity-60">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* ── 검색 바 (Raw 탭 제외) ── */}
      {activeTab !== 'raw' && (
        <div className="px-2 py-1.5 border-b shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('panels.header.common.searchPlaceholder')}
            className="w-full px-2 py-0.5 text-xs bg-muted rounded outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {/* ── Raw 탭: flex-col, textarea fills remaining space ── */}
      {activeTab === 'raw' && (
        <div className="flex-1 min-h-0 flex flex-col p-2 gap-2">
          <p className="text-xs text-muted-foreground shrink-0">
            {t('panels.header.common.rawHelp')}
          </p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            readOnly={readOnly}
            spellCheck={false}
            className="flex-1 min-h-0 w-full px-2 py-1.5 text-xs font-mono bg-muted rounded outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          {!readOnly && (
            <button
              onClick={() => onRawApply?.(rawText)}
              className="shrink-0 px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            >
              {t('panels.header.common.applyButton')}
            </button>
          )}
        </div>
      )}

      {/* ── 나머지 탭: 스크롤 가능한 컨텐츠 영역 ── */}
      {activeTab !== 'raw' && (
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* 기본 탭 */}
          {activeTab === 'basic' && (
            <div className="p-3 space-y-3">
              {filteredBasic.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">{t('panels.header.common.noSearchResults')}</div>
              )}
              {filteredBasic.map((field) => (
                <div key={field.key}>
                  <label className="text-xs text-muted-foreground block mb-1">
                    #{field.key.toUpperCase()} — {fieldLabel(field.key, field.label)}
                  </label>
                  {field.type === 'select' && field.options ? (
                    <select
                      value={getHeaderValue(field.key)}
                      onChange={(e) => handleBasicChange(field, e.target.value)}
                      disabled={readOnly}
                      className={inputCn}
                    >
                      <option value="">--</option>
                      {field.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : field.filePicker ? (
                    <FilePickerCombobox
                      value={getHeaderValue(field.key)}
                      onChange={(val) => handleBasicChange(field, val)}
                      files={imageFiles ?? []}
                      placeholder={field.placeholder}
                      disabled={readOnly}
                      inputClassName={inputCn}
                    />
                  ) : (
                    <input
                      key={field.key + ':' + getHeaderValue(field.key)}
                      type={field.type}
                      defaultValue={getHeaderValue(field.key)}
                      onBlur={(e) => {
                        if (!readOnly && e.target.value !== getHeaderValue(field.key))
                          handleBasicChange(field, e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') {
                          (e.target as HTMLInputElement).value = getHeaderValue(field.key);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      placeholder={field.placeholder}
                      readOnly={readOnly}
                      className={inputCn}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 커스텀 탭 */}
          {activeTab === 'custom' && (
            <MapEditor
              entries={chart.headers.custom}
              search={search}
              readOnly={readOnly}
              onSet={onCustomHeaderSet}
              onDelete={onCustomHeaderDelete}
              addKey={addKey}
              addValue={addValue}
              onAddKeyChange={setAddKey}
              onAddValueChange={setAddValue}
              onAdd={() => {
                if (!addKey.trim()) return;
                onCustomHeaderSet?.(addKey.trim(), addValue);
                setAddKey(''); setAddValue('');
              }}
            />
          )}

          {/* WAV 탭 */}
          {activeTab === 'wav' && (
            <MapEditor
              entries={chart.headers.wav}
              keyPrefix="WAV"
              search={search}
              readOnly={readOnly}
              onSet={onWavDefSet}
              onDelete={onWavDefDelete}
              addKey={addKey}
              addValue={addValue}
              onAddKeyChange={setAddKey}
              onAddValueChange={setAddValue}
              onAdd={() => {
                if (!addKey.trim()) return;
                onWavDefSet?.(addKey.trim(), addValue);
                setAddKey(''); setAddValue('');
              }}
            />
          )}

          {/* BMP 탭 */}
          {activeTab === 'bmp' && (
            <MapEditor
              entries={chart.headers.bmp}
              keyPrefix="BMP"
              search={search}
              readOnly={readOnly}
              onSet={onBmpDefSet}
              onDelete={onBmpDefDelete}
              addKey={addKey}
              addValue={addValue}
              onAddKeyChange={setAddKey}
              onAddValueChange={setAddValue}
              onAdd={() => {
                if (!addKey.trim()) return;
                onBmpDefSet?.(addKey.trim(), addValue);
                setAddKey(''); setAddValue('');
              }}
            />
          )}

        </div>
      )}

    </div>
  );
});

export default HeaderEditorPanel;
