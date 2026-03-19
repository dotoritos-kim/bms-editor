/**
 * HeaderEditorPanel
 *
 * BMS 차트 헤더 편집 패널
 * title, artist, genre, bpm, playlevel, difficulty, rank, total, stagefile, banner 편집
 */

import React, { useCallback } from 'react';
import { cn } from '../../utils';
import type { EditableBMSChart } from '@rhythm-archive/bms-core';
import { FilePickerCombobox } from './FilePickerCombobox';

interface HeaderEditorPanelProps {
  /** 현재 차트 */
  chart: EditableBMSChart;
  /** 헤더 필드 변경 콜백 */
  onHeaderChange: (field: string, value: string | number) => void;
  /** 읽기 전용 모드 */
  readOnly?: boolean;
  /** 같은 디렉토리의 이미지 파일 목록 (파일 피커용) */
  imageFiles?: string[];
  /** 추가 클래스명 */
  className?: string;
}

interface SelectOption {
  value: number;
  label: string;
}

interface HeaderField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  placeholder?: string;
  options?: SelectOption[];
  /** 파일 피커를 표시할지 여부 */
  filePicker?: boolean;
}

/** BMS #RANK (판정 난이도) */
const RANK_OPTIONS: SelectOption[] = [
  { value: 0, label: '0 - VERY HARD' },
  { value: 1, label: '1 - HARD' },
  { value: 2, label: '2 - NORMAL' },
  { value: 3, label: '3 - EASY' },
];

/** BMS #DIFFICULTY (보면 난이도 카테고리) */
const DIFFICULTY_OPTIONS: SelectOption[] = [
  { value: 1, label: '1 - BEGINNER' },
  { value: 2, label: '2 - NORMAL' },
  { value: 3, label: '3 - HYPER' },
  { value: 4, label: '4 - ANOTHER' },
  { value: 5, label: '5 - INSANE' },
];

const HEADER_FIELDS: HeaderField[] = [
  { key: 'title', label: '제목', type: 'text', placeholder: 'Title' },
  { key: 'subtitle', label: '부제목', type: 'text', placeholder: 'Subtitle' },
  { key: 'artist', label: '아티스트', type: 'text', placeholder: 'Artist' },
  { key: 'subartist', label: '부 아티스트', type: 'text', placeholder: 'Subartist' },
  { key: 'genre', label: '장르', type: 'text', placeholder: 'Genre' },
  { key: 'bpm', label: 'BPM', type: 'number', placeholder: '130' },
  { key: 'playlevel', label: '레벨', type: 'number', placeholder: '1' },
  { key: 'difficulty', label: '난이도', type: 'select', options: DIFFICULTY_OPTIONS },
  { key: 'rank', label: '판정', type: 'select', options: RANK_OPTIONS },
  { key: 'total', label: 'Total', type: 'number', placeholder: '300' },
  { key: 'stagefile', label: 'Stage File', type: 'text', placeholder: 'stagefile.bmp', filePicker: true },
  { key: 'banner', label: 'Banner', type: 'text', placeholder: 'banner.bmp', filePicker: true },
];

export const HeaderEditorPanel = React.memo(function HeaderEditorPanel({
  chart,
  onHeaderChange,
  readOnly = false,
  imageFiles,
  className,
}: HeaderEditorPanelProps) {
  const getHeaderValue = useCallback(
    (key: string): string => {
      const headers = chart.headers as unknown as Record<string, string | number | undefined>;
      const value = headers[key];
      if (value === undefined || value === null) return '';
      return String(value);
    },
    [chart.headers]
  );

  const handleChange = useCallback(
    (field: HeaderField, value: string) => {
      if (readOnly) return;
      if (field.type === 'number' || field.type === 'select') {
        if (value === '' || value === '--') {
          onHeaderChange(field.key, '');
          return;
        }
        const num = parseFloat(value);
        if (!isNaN(num)) {
          onHeaderChange(field.key, num);
        }
      } else {
        onHeaderChange(field.key, value);
      }
    },
    [onHeaderChange, readOnly]
  );

  const inputClassName = cn(
    'w-full px-2 py-1 text-sm bg-muted rounded border-0',
    'focus:ring-1 focus:ring-primary',
    readOnly && 'opacity-60 cursor-not-allowed'
  );

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="px-3 py-2 border-b">
        <h3 className="text-sm font-semibold">차트 정보</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {HEADER_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="text-xs text-muted-foreground block mb-1">
              {field.label}
            </label>
            {field.type === 'select' && field.options ? (
              <select
                value={getHeaderValue(field.key) || ''}
                onChange={(e) => handleChange(field, e.target.value)}
                disabled={readOnly}
                className={inputClassName}
              >
                <option value="">--</option>
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : field.filePicker ? (
              <FilePickerCombobox
                value={getHeaderValue(field.key)}
                onChange={(val) => handleChange(field, val)}
                files={imageFiles ?? []}
                placeholder={field.placeholder}
                disabled={readOnly}
                inputClassName={inputClassName}
              />
            ) : (
              <input
                type={field.type}
                value={getHeaderValue(field.key)}
                onChange={(e) => handleChange(field, e.target.value)}
                placeholder={field.placeholder}
                readOnly={readOnly}
                className={inputClassName}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

export default HeaderEditorPanel;
