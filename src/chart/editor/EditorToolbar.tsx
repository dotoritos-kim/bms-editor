/**
 * EditorToolbar Component
 *
 * 도구 선택, 그리드 스냅, 노트 타입, Undo/Redo, 저장 등
 */

import React from 'react';
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
} from 'lucide-react';
import { cn } from '../../utils';
import type { KeyMode } from '../NoteChartViewer';
import {
  GRID_SNAP_OPTIONS,
  DEFAULT_NOTE_HEIGHT,
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
}: EditorToolbarProps) {
  const tools: { id: EditorTool; icon: React.ReactNode; label: string; shortcut: string; description: string }[] = [
    { id: 'select', icon: <MousePointer2 size={16} />, label: '선택', shortcut: 'V', description: '클릭/드래그로 노트를 선택합니다. Shift+클릭으로 추가 선택.' },
    { id: 'addNote', icon: <Plus size={16} />, label: '추가', shortcut: 'A', description: '��릭한 위치에 새 노트를 배치합니다.' },
    { id: 'delete', icon: <Trash2 size={16} />, label: '삭제', shortcut: 'D', description: '클릭한 노트를 삭제합니다.' },
    { id: 'move', icon: <Move size={16} />, label: '이동', shortcut: 'M', description: '선택한 노트를 드래그하거나 방향키로 이동합니다.' },
    { id: 'keysound', icon: <Music size={16} />, label: '키음', shortcut: 'K', description: '노트를 클릭하여 현재 키음을 할당합니다.' },
    { id: 'bpm', icon: <Gauge size={16} />, label: 'BPM', shortcut: 'B', description: '클릭��� 위치에 BPM 변경을 추가/편집합니다.' },
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
              className={cn(
                'relative flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-colors min-w-[40px]',
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400/50'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              )}
              title={`${tool.label} (${tool.shortcut}) — ${tool.description}`}
            >
              {tool.icon}
              <span className="text-[9px] leading-none">{tool.shortcut}</span>
            </button>
          );
        })}
      </div>

      {/* 그리드 스냅 */}
      <div className="flex items-center gap-1 border-r pr-2">
        <span className="text-xs text-muted-foreground">Grid:</span>
        <select
          value={GRID_SNAP_OPTIONS.includes(gridSnap as any) ? gridSnap : 'custom'}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'custom') {
              const input = prompt('Grid divisions per measure (1~3840):', String(gridSnap));
              if (input) {
                const parsed = parseInt(input, 10);
                if (parsed > 0 && parsed <= 3840) onGridSnapChange(parsed as GridSnap);
              }
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
        {!GRID_SNAP_OPTIONS.includes(gridSnap as any) && (
          <span className="text-[10px] text-yellow-400" title="Custom grid snap">{gridSnap}/m</span>
        )}
      </div>

      {/* Snap 토글 */}
      {onSnapToggle && (
        <div className="flex items-center gap-1 border-r pr-2">
          <button
            onClick={onSnapToggle}
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
                className={cn(
                  'w-6 h-6 text-[10px] font-bold rounded transition-colors',
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
          <span className="text-xs text-muted-foreground">H:</span>
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
          <span className="text-[10px] text-muted-foreground w-4">{noteHeight}</span>
        </div>
      )}

      {/* 키 모드 */}
      {keyMode && onKeyModeChange && (
        <div className="flex items-center gap-1 border-r pr-2">
          <span className="text-xs text-muted-foreground">Keys:</span>
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
          className="p-2 rounded hover:bg-muted transition-colors disabled:opacity-30"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={18} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
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
          className="p-2 rounded hover:bg-muted transition-colors"
          title="Copy (Ctrl+C)"
        >
          <Copy size={18} />
        </button>
        <button
          onClick={onPaste}
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
              'px-3 py-1.5 text-sm rounded flex items-center gap-1',
              hasUnsavedChanges
                ? 'bg-yellow-500 text-yellow-950 hover:bg-yellow-400'
                : 'bg-muted hover:bg-muted/80'
            )}
            title="Save (Ctrl+S)"
          >
            <Save size={16} />
            Save
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
      <div className="flex items-center gap-2 px-3 py-1 border-t border-border/50 text-[11px] text-muted-foreground">
        <span className="font-semibold text-blue-400">{activeToolInfo.label}</span>
        <span className="text-border/60">|</span>
        <span>{activeToolInfo.description}</span>
      </div>
    )}
    </div>
  );
});
