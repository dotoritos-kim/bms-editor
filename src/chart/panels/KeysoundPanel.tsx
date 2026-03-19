/**
 * KeysoundPanel
 *
 * 차트 에디터용 키음 피커 패널
 * WAV 목록, 검색, 클릭 선택, 재생 미리듣기
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Search, Volume2, Loader2, VolumeX, Upload } from 'lucide-react';
import { cn } from '../../utils';

interface KeysoundPanelProps {
  /** WAV 정의 목록 (ID → 파일명) */
  keysounds: Record<string, string>;
  /** 현재 선택된 키음 ID */
  currentKeysound: string;
  /** 키음 선택 콜백 */
  onSelect: (keysoundId: string) => void;
  /** 키음 미리듣기 콜백 */
  onPreview?: (keysoundId: string) => void;
  /** 오디오 로드 완료 여부 */
  isAudioReady?: boolean;
  /** 오디오 로딩 중 여부 */
  isAudioLoading?: boolean;
  /** 업로드 버튼 클릭 콜백 */
  onUploadClick?: () => void;
  /** 추가 클래스명 */
  className?: string;
}

export const KeysoundPanel = React.memo(function KeysoundPanel({
  keysounds,
  currentKeysound,
  onSelect,
  onPreview,
  isAudioReady = false,
  isAudioLoading = false,
  onUploadClick,
  className,
}: KeysoundPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const entries = useMemo(() => {
    const all = Object.entries(keysounds).sort(([a], [b]) => a.localeCompare(b));
    if (!searchQuery) return all;
    const q = searchQuery.toLowerCase();
    return all.filter(
      ([id, filename]) =>
        id.toLowerCase().includes(q) || filename.toLowerCase().includes(q)
    );
  }, [keysounds, searchQuery]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect]
  );

  const handlePreview = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      onPreview?.(id);
    },
    [onPreview]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, id: string) => {
      e.dataTransfer.setData('application/x-keysound-id', id);
      e.dataTransfer.effectAllowed = 'copy';
    },
    []
  );

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="px-3 py-2 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">키음</h3>
          {onUploadClick && (
            <button
              onClick={onUploadClick}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="키음 파일 업로드"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-xs bg-muted rounded border-0 focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 무음 (No Sound) 옵션 - 항상 상단에 표시 */}
        {(!searchQuery || '00'.includes(searchQuery.toLowerCase()) || '무음'.includes(searchQuery) || 'no sound'.includes(searchQuery.toLowerCase())) && (
          <div className="border-b">
            <button
              onClick={() => handleSelect('00')}
              draggable
              onDragStart={(e) => handleDragStart(e, '00')}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left cursor-grab active:cursor-grabbing',
                currentKeysound === '00' && 'bg-primary/10 text-primary'
              )}
            >
              <span className="font-mono w-6 text-center shrink-0">00</span>
              <VolumeX className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1 text-muted-foreground italic">무음 / No Sound</span>
            </button>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {searchQuery ? '검색 결과 없음' : '키음이 없습니다'}
          </div>
        ) : (
          <div className="divide-y">
            {entries.map(([id, filename]) => (
              <button
                key={id}
                onClick={() => handleSelect(id)}
                draggable
                onDragStart={(e) => handleDragStart(e, id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left cursor-grab active:cursor-grabbing',
                  currentKeysound === id && 'bg-primary/10 text-primary'
                )}
              >
                <span className="font-mono w-6 text-center shrink-0">{id}</span>
                <span className="truncate flex-1 text-muted-foreground">{filename}</span>
                {onPreview && (
                  <button
                    onClick={(e) => handlePreview(e, id)}
                    disabled={!isAudioReady}
                    className={cn(
                      'p-0.5 shrink-0',
                      isAudioReady
                        ? 'hover:text-primary'
                        : 'opacity-30 cursor-not-allowed'
                    )}
                    title={
                      isAudioLoading
                        ? '오디오 로딩 중...'
                        : isAudioReady
                          ? '미리듣기'
                          : '오디오 미로드'
                    }
                  >
                    {isAudioLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Volume2 className="h-3 w-3" />
                    )}
                  </button>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t text-xs text-muted-foreground">
        {Object.keys(keysounds).length}개 키음
        {searchQuery && ` (${entries.length}개 필터)`}
      </div>
    </div>
  );
});

export default KeysoundPanel;
