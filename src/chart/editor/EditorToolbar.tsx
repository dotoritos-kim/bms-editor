/**
 * EditorToolbar Component
 *
 * 도구 선택, 그리드 스냅, 노트 타입, Undo/Redo, 저장 등
 */

import React, { useRef } from 'react';
import {
  MousePointer2,
  Plus,
  Trash2,
  Move,
  Music,
  Gauge,
  Timer,
  Undo2,
  Redo2,
  Copy,
  Clipboard,
  Save,
  GitBranch,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { cn } from '../../utils';
import type { KeyMode } from '../NoteChartViewer';
import {
  GRID_SNAP_OPTIONS,
  DEFAULT_NOTE_HEIGHT,
  isPresetGridSnap,
  type EditorTool,
  type GridSnap,
  type EditorToolbarProps,
} from './types';

const KEY_MODE_OPTIONS: KeyMode[] = ['4K', '5K', '6K', '7K', '8K', '9K', '10K', '12K', '14K', '18K', '24K', '48K'];

export const EditorToolbar = React.memo(function EditorToolbar({
  activeTool,
  onToolChange,
  gridSnap,
  onGridSnapChange,
  selectedNoteType,
  onNoteTypeChange,
  keyMode,
  onKeyModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  hasUnsavedChanges,
  onSave,
  onCreatePR,
  branchName,
  noteHeight = DEFAULT_NOTE_HEIGHT,
  onNoteHeightChange,
  snapEnabled = true,
  onSnapToggle,
  layerConfig,
  onLayerVisibleToggle,
  onLayerLockToggle,
  onZoomIn,
  onZoomOut,
  onZoomPreset,
  onZoomFit,
  currentBeatScale,
}: EditorToolbarProps) {
  const [showZoomPreset, setShowZoomPreset] = React.useState(false);
  const [showCustomGrid, setShowCustomGrid] = React.useState(false);
  const customGridInputRef = useRef<HTMLInputElement>(null);
  const zoomPresetRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!showZoomPreset) return;
    const close = (e: MouseEvent) => {
      if (!zoomPresetRef.current?.contains(e.target as Node)) setShowZoomPreset(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showZoomPreset]);

  const tools: { id: EditorTool; icon: React.ReactNode; label: string; shortcut: string; description: string }[] = [
    { id: 'select', icon: <MousePointer2 size={16} />, label: '선택', shortcut: 'V', description: '클릭/드래그로 노트를 선택합니다. Shift+클릭으로 추가 선택.' },
    { id: 'addNote', icon: <Plus size={16} />, label: '추가', shortcut: 'A', description: '클릭한 위치에 새 노트를 배치합니다.' },
    { id: 'delete', icon: <Trash2 size={16} />, label: '삭제', shortcut: 'D', description: '클릭한 노트를 삭제합니다.' },
    { id: 'move', icon: <Move size={16} />, label: '이동', shortcut: 'M', description: '선택한 노트를 드래그하거나 방향키로 이동합니다.' },
    { id: 'keysound', icon: <Music size={16} />, label: '키음', shortcut: 'K', description: '노트를 클릭하여 현재 키음을 할당합니다.' },
    { id: 'bpm', icon: <Gauge size={16} />, label: 'BPM', shortcut: 'B', description: '클릭한 위치에 BPM 변경을 추가/편집합니다.' },
    { id: 'stop', icon: <Timer size={16} />, label: 'STOP', shortcut: 'T', description: '클릭한 위치에 STOP 이벤트를 추가/편집합니다.' },
  ];

  const noteTypes: { id: typeof selectedNoteType; label: string }[] = [
    { id: 'playable', label: 'Playable' },
    { id: 'invisible', label: 'Invisible' },
    { id: 'landmine', label: 'Landmine' },
    { id: 'longNote', label: 'Long Note' },
    { id: 'bgm', label: 'BGM' },
  ];

  const activeToolInfo = tools.find((t) => t.id === activeTool);

  return (
    <div className="flex flex-col bg-muted/50 border-b">
    <div className="flex items-center gap-2 p-2">
      {/* 도구 선택 */}
      <div className="flex items-center gap-1 border-r pr-2">
        {tools.map((tool) => {
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              aria-pressed={isActive}
              aria-label={`${tool.label} (${tool.shortcut})`}
              className={cn(
                'relative flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-colors min-w-[40px]',
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400/50'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              )}
              title={`${tool.label} (${tool.shortcut}) - ${tool.description}`}
            >
              {tool.icon}
              <span className="text-xs leading-none">{tool.shortcut}</span>
            </button>
          );
        })}
      </div>

      {/* 그리드 스냅 */}
      <div className="flex items-center gap-1 border-r pr-2">
        <span className="text-xs text-muted-foreground">Grid:</span>
        {showCustomGrid ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = customGridInputRef.current?.value ?? '';
              const parsed = parseInt(val, 10);
              if (parsed > 0 && parsed <= 3840) onGridSnapChange(parsed as GridSnap);
              setShowCustomGrid(false);
            }}
            className="flex items-center gap-1"
          >
            <input
              ref={customGridInputRef}
              type="number"
              min={1}
              max={3840}
              defaultValue={String(gridSnap)}
              autoFocus
              className="w-16 px-1.5 py-0.5 text-xs bg-muted border border-blue-500 rounded"
              onBlur={(e) => {
                // Submit value on blur instead of just closing
                const val = e.currentTarget.value;
                const parsed = parseInt(val, 10);
                if (parsed > 0 && parsed <= 3840) onGridSnapChange(parsed as GridSnap);
                setShowCustomGrid(false);
              }}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.currentTarget.blur(); } }}
            />
            <span className="text-xs text-zinc-400">/m</span>
          </form>
        ) : (
        <select
          value={isPresetGridSnap(gridSnap) ? gridSnap : 'custom'}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'custom') {
              setShowCustomGrid(true);
            } else {
              onGridSnapChange(parseInt(val) as GridSnap);
            }
          }}
          className="px-2 py-1 text-xs bg-muted rounded"
        >
          {GRID_SNAP_OPTIONS.map((snap) => {
            const perBeat = snap / 4;
            const label = Number.isInteger(perBeat) ? `1/${perBeat}` : `${snap}/m`;
            return (
              <option key={snap} value={snap}>
                {label}
              </option>
            );
          })}
          <option value="custom">Custom...</option>
        </select>
        )}
        {!showCustomGrid && !isPresetGridSnap(gridSnap) && (
          <span className="text-xs text-yellow-400" title="Custom grid snap">{gridSnap}/m</span>
        )}
      </div>

      {/* Snap 토글 */}
      {onSnapToggle && (
        <div className="flex items-center gap-1 border-r pr-2">
          <button
            onClick={onSnapToggle}
            aria-pressed={snapEnabled}
            aria-label={`그리드 스냅 ${snapEnabled ? '켜짐' : '꺼짐'}`}
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors',
              snapEnabled
                ? 'bg-green-600 text-white'
                : 'bg-muted text-muted-foreground'
            )}
            title={`Snap to Grid: ${snapEnabled ? 'ON' : 'OFF'} (Shift 드래그=임시 해제)`}
          >
            Snap {snapEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      )}

      {/* Layer 토글 */}
      {layerConfig && onLayerVisibleToggle && (
        <div className="flex items-center gap-0.5 border-r pr-2">
          {(['playable', 'invisible', 'landmine', 'bgm'] as const).map((layer) => {
            const lc = layerConfig[layer];
            const labels = { playable: 'P', invisible: 'I', landmine: 'L', bgm: 'B' };
            const colors = { playable: '#4488ff', invisible: '#888888', landmine: '#ff4444', bgm: '#666666' };
            return (
              <button
                key={layer}
                onClick={() => onLayerVisibleToggle(layer)}
                onContextMenu={(e) => { e.preventDefault(); onLayerLockToggle?.(layer); }}
                aria-pressed={lc.visible}
                aria-label={`${layer} 레이어 ${lc.visible ? '표시중' : '숨김'}${lc.locked ? ' (잠금)' : ''}`}
                className={cn(
                  'w-7 h-7 text-xs font-bold rounded transition-colors',
                  !lc.visible ? 'opacity-30 bg-muted' : lc.locked ? 'ring-1 ring-red-400' : ''
                )}
                style={{ backgroundColor: lc.visible ? colors[layer] + '40' : undefined, color: colors[layer] }}
                title={`${layer}: ${lc.visible ? 'visible' : 'hidden'}${lc.locked ? ' (locked)' : ''}\n좌클릭=가시성, 우클릭=잠금`}
              >
                {labels[layer]}
              </button>
            );
          })}
        </div>
      )}

      {/* 노트 두께 */}
      {onNoteHeightChange && (
        <div className="flex items-center gap-1 border-r pr-2">
          <span className="text-xs text-muted-foreground" title="노트 두께">두께:</span>
          <input
            type="range"
            min={1}
            max={8}
            step={0.5}
            value={noteHeight}
            onChange={(e) => onNoteHeightChange(parseFloat(e.target.value))}
            className="w-14 h-1 accent-blue-500"
            title={`노트 두께: ${noteHeight}`}
          />
          <span className="text-xs text-muted-foreground w-5">{noteHeight}</span>
        </div>
      )}

      {/* 줌 컨트롤 */}
      {(onZoomIn || onZoomOut) && (
        <div className="flex items-center gap-1 border-r pr-2">
          <span className="text-xs text-muted-foreground" title="줌 배율">줌:</span>
          <button
            onClick={onZoomOut}
            disabled={currentBeatScale !== undefined && currentBeatScale <= 2}
            aria-label="축소"
            className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="축소 (-)"
          >
            <ZoomOut size={14} />
          </button>
          <div className="relative" ref={zoomPresetRef}>
            <button
              onClick={() => setShowZoomPreset((v) => !v)}
              aria-label="줌 배율 프리셋"
              aria-expanded={showZoomPreset}
              aria-haspopup="listbox"
              className="w-10 text-xs text-center text-muted-foreground hover:text-foreground px-1"
              title="줌 배율 (클릭: 프리셋)"
            >
              {currentBeatScale ?? 20}
            </button>
            {showZoomPreset && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-popover border border-border rounded shadow-md z-50 py-1 min-w-[100px]">
                {[
                  { label: 'Overview', scale: 5 },
                  { label: 'Work', scale: 20 },
                  { label: 'Detail', scale: 80 },
                ].map((p) => (
                  <button
                    key={p.scale}
                    onClick={() => { onZoomPreset?.(p.scale); setShowZoomPreset(false); }}
                    className={cn(
                      'block w-full px-3 py-1 text-xs hover:bg-muted text-left transition-colors',
                      currentBeatScale === p.scale && 'text-blue-400'
                    )}
                  >
                    {p.label} <span className="text-muted-foreground">({p.scale})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onZoomIn}
            disabled={currentBeatScale !== undefined && currentBeatScale >= 200}
            aria-label="확대"
            className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="확대 (=)"
          >
            <ZoomIn size={14} />
          </button>
          {onZoomFit && (
            <button
              onClick={onZoomFit}
              aria-label="차트 전체 보기"
              className="p-1.5 rounded hover:bg-muted transition-colors"
              title="차트 전체 보기"
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      )}

      {/* 키 모드 */}
      {keyMode && onKeyModeChange && (
        <div className="flex items-center gap-1 border-r pr-2">
          <span className="text-xs text-muted-foreground" title="키 모드">모드:</span>
          <select
            value={keyMode}
            onChange={(e) => onKeyModeChange(e.target.value as KeyMode)}
            className="px-2 py-1 text-xs bg-muted rounded"
          >
            {KEY_MODE_OPTIONS.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 노트 타입 (addNote 도구일 때만) */}
      {activeTool === 'addNote' && (
        <div className="flex items-center gap-1 border-r pr-2">
          {noteTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => onNoteTypeChange(type.id)}
              className={cn(
                'px-2 py-1 text-xs rounded hover:bg-muted transition-colors',
                selectedNoteType === type.id &&
                  'bg-primary text-primary-foreground'
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      )}

      {/* Undo/Redo */}
      <div className="flex items-center gap-1 border-r pr-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="실행 취소 (Ctrl+Z)"
          className="p-2 rounded hover:bg-muted transition-colors disabled:opacity-30"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={18} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="다시 실행 (Ctrl+Y)"
          className="p-2 rounded hover:bg-muted transition-colors disabled:opacity-30"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={18} />
        </button>
      </div>

      {/* Copy/Paste */}
      <div className="flex items-center gap-1 border-r pr-2">
        <button
          onClick={onCopy}
          aria-label="복사 (Ctrl+C)"
          className="p-2 rounded hover:bg-muted transition-colors"
          title="Copy (Ctrl+C)"
        >
          <Copy size={18} />
        </button>
        <button
          onClick={onPaste}
          aria-label="붙여넣기 (Ctrl+V)"
          className="p-2 rounded hover:bg-muted transition-colors"
          title="Paste (Ctrl+V)"
        >
          <Clipboard size={18} />
        </button>
      </div>

      {/* 저장/PR */}
      <div className="flex items-center gap-1 ml-auto">
        {branchName && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground px-2">
            <GitBranch size={14} />
            <span>{branchName}</span>
          </div>
        )}
        {onSave && (
          <button
            onClick={onSave}
            className={cn(
              'px-3 py-1.5 text-sm rounded flex items-center gap-1.5 font-medium',
              hasUnsavedChanges
                ? 'bg-yellow-500 text-yellow-950 hover:bg-yellow-400'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            )}
            title="저장 (Ctrl+S)"
          >
            <Save size={16} />
            {hasUnsavedChanges ? '저장' : '저장됨'}
          </button>
        )}
        {onCreatePR && (
          <button
            onClick={onCreatePR}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded flex items-center gap-1 hover:bg-primary/90"
          >
            <GitBranch size={16} />
            Create PR
          </button>
        )}
      </div>
    </div>
    {/* 현재 도구 설명 바 */}
    {activeToolInfo && (
      <div className="flex items-center gap-2 px-3 py-1 border-t border-border/50 text-xs text-muted-foreground">
        <span className="font-semibold text-blue-400">{activeToolInfo.label}</span>
        <span className="text-border/60">|</span>
        <span>{activeToolInfo.description}</span>
      </div>
    )}
    </div>
  );
});
