/**
 * KeysoundPanel
 *
 * 차트 에디터용 키음 피커 패널
 * WAV 목록, 검색, 클릭 선택, 재생 미리듣기,
 * 사용 횟수 배지, 우클릭 컨텍스트 메뉴, 하이라이트 토글
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Search, Volume2, Loader2, VolumeX, Upload, Crosshair, Replace, Trash2, Highlighter } from 'lucide-react';
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
  /** 키음별 사용 횟수 (ID → count) */
  keysoundUsageCounts?: Record<string, number>;
  /** 이 키음을 사용하는 노트 찾기 콜백 */
  onFindNotes?: (keysoundId: string) => void;
  /** 키음 일괄 교체 시작 콜백 */
  onReplaceKeysound?: (keysoundId: string) => void;
  /** 미사용 키음 삭제 콜백 */
  onDeleteUnused?: (keysoundId: string) => void;
  /** 현재 하이라이트 중인 키음 */
  highlightKeysound?: string | null;
  /** 키음 하이라이트 토글 콜백 */
  onHighlightKeysound?: (keysoundId: string | null) => void;
  /** 이 키음의 BGM 노트만 선택 콜백 */
  onSelectBgmNotes?: (keysoundId: string) => void;
  /** 추가 클래스명 */
  className?: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  keysoundId: string;
}

export const KeysoundPanel = React.memo(function KeysoundPanel({
  keysounds,
  currentKeysound,
  onSelect,
  onPreview,
  isAudioReady = false,
  isAudioLoading = false,
  onUploadClick,
  keysoundUsageCounts,
  onFindNotes,
  onReplaceKeysound,
  onDeleteUnused,
  highlightKeysound,
  onHighlightKeysound,
  onSelectBgmNotes,
  className,
}: KeysoundPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (!onFindNotes && !onReplaceKeysound && !onDeleteUnused && !onHighlightKeysound) return;
      e.preventDefault();
      e.stopPropagation();
      const panelRect = panelRef.current?.getBoundingClientRect();
      const x = e.clientX - (panelRect?.left ?? 0);
      const y = e.clientY - (panelRect?.top ?? 0);
      setContextMenu({ x, y, keysoundId: id });
    },
    [onFindNotes, onReplaceKeysound, onDeleteUnused, onHighlightKeysound, onSelectBgmNotes]
  );

  // 외부 클릭 시 컨텍스트 메뉴 닫기
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  const hasContextMenu = !!(onFindNotes || onReplaceKeysound || onDeleteUnused || onHighlightKeysound || onSelectBgmNotes);

  return (
    <div ref={panelRef} className={cn('flex flex-col h-full relative', className)}>
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
                'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors text-left cursor-grab active:cursor-grabbing',
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
            {entries.map(([id, filename]) => {
              const usageCount = keysoundUsageCounts?.[id] ?? undefined;
              const isHighlighted = highlightKeysound === id;
              return (
                <button
                  key={id}
                  onClick={() => handleSelect(id)}
                  onContextMenu={hasContextMenu ? (e) => handleContextMenu(e, id) : undefined}
                  draggable
                  onDragStart={(e) => handleDragStart(e, id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors text-left cursor-grab active:cursor-grabbing',
                    currentKeysound === id && 'bg-primary/10 text-primary',
                    isHighlighted && 'bg-orange-500/15 ring-1 ring-orange-500/40'
                  )}
                >
                  <span className="font-mono w-6 text-center shrink-0">{id}</span>
                  <span className={cn(
                    'truncate flex-1',
                    usageCount === 0 ? 'text-zinc-600 line-through' : 'text-muted-foreground'
                  )}>{filename}</span>
                  {usageCount !== undefined && (
                    <span className={cn(
                      'text-[10px] shrink-0 tabular-nums',
                      usageCount === 0 ? 'text-zinc-600' : 'text-muted-foreground'
                    )}>
                      ({usageCount})
                    </span>
                  )}
                  {/* Audio status indicator (no separate button — click row to preview) */}
                  {isAudioLoading && (
                    <Loader2 className="h-3 w-3 animate-spin shrink-0 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t text-xs text-muted-foreground">
        {Object.keys(keysounds).length}개 키음
        {searchQuery && ` (${entries.length}개 필터)`}
      </div>

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="absolute z-50 min-w-[180px] bg-zinc-900 border border-zinc-700 rounded-md shadow-lg py-1 text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {onFindNotes && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 text-left"
              onClick={() => { onFindNotes(contextMenu.keysoundId); setContextMenu(null); }}
            >
              <Crosshair className="h-3 w-3" />
              이 키음 사용 노트 찾기
            </button>
          )}
          {onHighlightKeysound && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 text-left"
              onClick={() => {
                onHighlightKeysound(highlightKeysound === contextMenu.keysoundId ? null : contextMenu.keysoundId);
                setContextMenu(null);
              }}
            >
              <Highlighter className="h-3 w-3" />
              {highlightKeysound === contextMenu.keysoundId ? '하이라이트 해제' : '차트에서 하이라이트'}
            </button>
          )}
          {onSelectBgmNotes && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 text-left"
              onClick={() => { onSelectBgmNotes(contextMenu.keysoundId); setContextMenu(null); }}
            >
              <Volume2 className="h-3 w-3" />
              이 키음 BGM 노트 선택
            </button>
          )}
          {onReplaceKeysound && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 text-left"
              onClick={() => { onReplaceKeysound(contextMenu.keysoundId); setContextMenu(null); }}
            >
              <Replace className="h-3 w-3" />
              키음 일괄 교체...
            </button>
          )}
          {onDeleteUnused && (keysoundUsageCounts?.[contextMenu.keysoundId] ?? 1) === 0 && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 text-red-400 text-left"
              onClick={() => { onDeleteUnused(contextMenu.keysoundId); setContextMenu(null); }}
            >
              <Trash2 className="h-3 w-3" />
              미사용 키음 삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default KeysoundPanel;
