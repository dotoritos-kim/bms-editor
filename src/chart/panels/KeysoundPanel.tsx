/**
 * KeysoundPanel
 *
 * Keysound picker panel for the chart editor.
 * WAV list, search, click-to-select, playback preview,
 * usage count badge, right-click context menu, highlight toggle.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Search, Volume2, Loader2, VolumeX, Upload, Crosshair, Replace, Trash2, Highlighter } from 'lucide-react';
import { cn } from '../../utils';
import { useI18n } from '../../i18n';

interface KeysoundPanelProps {
  /** WAV definition list (ID → filename) */
  keysounds: Record<string, string>;
  /** Currently selected keysound ID */
  currentKeysound: string;
  /** Keysound selection callback */
  onSelect: (keysoundId: string) => void;
  /** Keysound preview playback callback */
  onPreview?: (keysoundId: string) => void;
  /** Whether audio has finished loading */
  isAudioReady?: boolean;
  /** Whether audio is currently loading */
  isAudioLoading?: boolean;
  /** Upload button click callback */
  onUploadClick?: () => void;
  /** Per-keysound usage counts (ID → count) */
  keysoundUsageCounts?: Record<string, number>;
  /** Callback to find notes using this keysound */
  onFindNotes?: (keysoundId: string) => void;
  /** Callback to start bulk-replacing this keysound */
  onReplaceKeysound?: (keysoundId: string) => void;
  /** Callback to delete an unused keysound */
  onDeleteUnused?: (keysoundId: string) => void;
  /** Currently highlighted keysound */
  highlightKeysound?: string | null;
  /** Keysound highlight toggle callback */
  onHighlightKeysound?: (keysoundId: string | null) => void;
  /** Callback to select only the BGM notes for this keysound */
  onSelectBgmNotes?: (keysoundId: string) => void;
  /** Additional CSS class name */
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
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
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

  // Group entries by folder (directory portion of filename)
  const groupedEntries = useMemo(() => {
    if (searchQuery) return null; // flat list when searching
    const groups = new Map<string, [string, string][]>();
    for (const entry of entries) {
      const filename = entry[1];
      const slashIdx = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
      const folder = slashIdx > 0 ? filename.substring(0, slashIdx) : '';
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder)!.push(entry);
    }
    // Only group if there's more than 1 folder
    if (groups.size <= 1) return null;
    return groups;
  }, [entries, searchQuery]);

  const toggleFolder = useCallback((folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder); else next.add(folder);
      return next;
    });
  }, []);

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

  // Close context menu on outside click
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
          <h3 className="text-sm font-semibold">{t('panels.keysound.title')}</h3>
          {onUploadClick && (
            <button
              onClick={onUploadClick}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title={t('panels.keysound.uploadTooltip')}
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('panels.keysound.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-xs bg-muted rounded border-0 focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Silent (No Sound) option — always shown at the top */}
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
              <span className="truncate flex-1 text-muted-foreground italic">{t('panels.keysound.noSilent')}</span>
            </button>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {searchQuery ? t('panels.keysound.noSearchResults') : t('panels.keysound.empty')}
          </div>
        ) : (
          <div className="divide-y">
            {groupedEntries ? (
              // Folder-grouped view
              Array.from(groupedEntries.entries()).map(([folder, items]) => (
                <div key={folder || '_root'}>
                  {folder && (
                    <button
                      onClick={() => toggleFolder(folder)}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-400 bg-zinc-900/50 hover:bg-zinc-800/50 border-b border-border/30"
                    >
                      <span className="text-xs">{collapsedFolders.has(folder) ? '▶' : '▼'}</span>
                      📁 {folder}
                      <span className="ml-auto text-zinc-600">{items.length}</span>
                    </button>
                  )}
                  {!collapsedFolders.has(folder) && items.map(([id, filename]) => {
                    const usageCount = keysoundUsageCounts?.[id] ?? undefined;
                    const isHighlighted = highlightKeysound === id;
                    const displayName = folder ? filename.substring(folder.length + 1) : filename;
                    return (
                      <button key={id} onClick={() => handleSelect(id)} onContextMenu={hasContextMenu ? (e) => handleContextMenu(e, id) : undefined} draggable onDragStart={(e) => handleDragStart(e, id)}
                        className={cn('w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors text-left cursor-grab active:cursor-grabbing', folder && 'pl-5', currentKeysound === id && 'bg-primary/10 text-primary', isHighlighted && 'bg-orange-500/15 ring-1 ring-orange-500/40')}>
                        <span className="font-mono w-6 text-center shrink-0">{id}</span>
                        <span className={cn('truncate flex-1', usageCount === 0 ? 'text-zinc-600 line-through' : 'text-muted-foreground')}>{displayName}</span>
                        {usageCount !== undefined && <span className={cn('text-xs shrink-0 tabular-nums', usageCount === 0 ? 'text-zinc-600' : 'text-muted-foreground')}>({usageCount})</span>}
                        {isAudioLoading && <Loader2 className="h-3 w-3 animate-spin shrink-0 text-muted-foreground" />}
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              // Flat list (no folders or searching)
              entries.map(([id, filename]) => {
                const usageCount = keysoundUsageCounts?.[id] ?? undefined;
                const isHighlighted = highlightKeysound === id;
                return (
                  <button key={id} onClick={() => handleSelect(id)} onContextMenu={hasContextMenu ? (e) => handleContextMenu(e, id) : undefined} draggable onDragStart={(e) => handleDragStart(e, id)}
                    className={cn('w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors text-left cursor-grab active:cursor-grabbing', currentKeysound === id && 'bg-primary/10 text-primary', isHighlighted && 'bg-orange-500/15 ring-1 ring-orange-500/40')}>
                    <span className="font-mono w-6 text-center shrink-0">{id}</span>
                    <span className={cn('truncate flex-1', usageCount === 0 ? 'text-zinc-600 line-through' : 'text-muted-foreground')}>{filename}</span>
                    {usageCount !== undefined && <span className={cn('text-xs shrink-0 tabular-nums', usageCount === 0 ? 'text-zinc-600' : 'text-muted-foreground')}>({usageCount})</span>}
                    {isAudioLoading && <Loader2 className="h-3 w-3 animate-spin shrink-0 text-muted-foreground" />}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t text-xs text-muted-foreground">
        {t('panels.keysound.countSummary', { count: Object.keys(keysounds).length })}
        {searchQuery && ` ${t('panels.keysound.filteredSummary', { count: entries.length })}`}
      </div>

      {/* Context menu */}
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
              {t('panels.keysound.contextMenu.findNotes')}
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
              {highlightKeysound === contextMenu.keysoundId ? t('panels.keysound.contextMenu.highlightOff') : t('panels.keysound.contextMenu.highlightOn')}
            </button>
          )}
          {onSelectBgmNotes && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 text-left"
              onClick={() => { onSelectBgmNotes(contextMenu.keysoundId); setContextMenu(null); }}
            >
              <Volume2 className="h-3 w-3" />
              {t('panels.keysound.contextMenu.selectBgm')}
            </button>
          )}
          {onReplaceKeysound && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 text-left"
              onClick={() => { onReplaceKeysound(contextMenu.keysoundId); setContextMenu(null); }}
            >
              <Replace className="h-3 w-3" />
              {t('panels.keysound.contextMenu.replace')}
            </button>
          )}
          {onDeleteUnused && (keysoundUsageCounts?.[contextMenu.keysoundId] ?? 1) === 0 && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 text-red-400 text-left"
              onClick={() => { onDeleteUnused(contextMenu.keysoundId); setContextMenu(null); }}
            >
              <Trash2 className="h-3 w-3" />
              {t('panels.keysound.contextMenu.deleteUnused')}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default KeysoundPanel;
