/**
 * FilePickerCombobox
 *
 * 레포지토리 내 이미지 파일을 검색/선택할 수 있는 콤보박스.
 * Uses plain HTML/CSS instead of Radix UI Popover + cmdk for standalone usage.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { Check, FolderOpen } from 'lucide-react';
import { cn } from '../../utils';

interface FilePickerComboboxProps {
  /** 현재 선택된 파일명 */
  value: string;
  /** 파일 선택/변경 콜백 */
  onChange: (value: string) => void;
  /** 선택 가능한 파일 목록 */
  files: string[];
  /** placeholder 텍스트 */
  placeholder?: string;
  /** 비활성화 여부 */
  disabled?: boolean;
  /** 입력 필드 클래스명 */
  inputClassName?: string;
}

export function FilePickerCombobox({
  value,
  onChange,
  files,
  placeholder,
  disabled = false,
  inputClassName,
}: FilePickerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filteredFiles = useMemo(() => {
    if (!search) return files;
    const q = search.toLowerCase();
    return files.filter((f) => f.toLowerCase().includes(q));
  }, [files, search]);

  const handleSelect = (filename: string) => {
    onChange(filename);
    setOpen(false);
    setSearch('');
  };

  return (
    <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={disabled}
        className={cn(inputClassName, 'flex-1')}
      />
      {!disabled && files.length > 0 && (
        <div ref={popoverRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(!open)}
            style={{
              padding: '4px 6px',
              background: '#2a2a3e',
              border: '1px solid #444',
              borderRadius: 4,
              cursor: 'pointer',
              color: '#e5e7eb',
              flexShrink: 0,
            }}
            title="Browse files"
          >
            <FolderOpen style={{ width: 14, height: 14 }} />
          </button>
          {open && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 4,
              width: 224,
              background: '#1e1e2e',
              border: '1px solid #444',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              zIndex: 50,
            }}>
              <input
                type="text"
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 12,
                  background: '#2a2a3e',
                  border: 'none',
                  borderBottom: '1px solid #333',
                  borderRadius: '6px 6px 0 0',
                  color: '#e5e7eb',
                  outline: 'none',
                }}
                autoFocus
              />
              <div style={{ maxHeight: 192, overflowY: 'auto' }}>
                {filteredFiles.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12, textAlign: 'center', color: '#9ca3af' }}>
                    No matching files
                  </div>
                ) : (
                  filteredFiles.map((file) => (
                    <button
                      key={file}
                      onClick={() => handleSelect(file)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        width: '100%',
                        padding: '4px 8px',
                        fontSize: 12,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#e5e7eb',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a3e'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    >
                      <Check style={{ width: 12, height: 12, opacity: value === file ? 1 : 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
