/**
 * Minimap
 *
 * 에디터 미니맵 컴포넌트
 * 2D Canvas 기반 — 레인 기반 노트 배치, 뷰포트 인디케이터, 드래그 스크롤
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { cn } from '../../utils';
import { useI18n } from '../../i18n';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

// 레인 색상 (column id → color). 에디터 laneConfig와 동일한 팔레트.
const LANE_COLORS: Record<string, string> = {
  SC: '#ff3366',
  '1': '#ffffff',
  '2': '#5599ff',
  '3': '#ffffff',
  '4': '#5599ff',
  '5': '#ffffff',
  '6': '#5599ff',
  '7': '#ffffff',
  '8': '#ff6b6b',
  '9': '#e056fd',
  FZ: '#888888',
};
const DEFAULT_NOTE_COLOR = '#88aaff';

interface MinimapNote {
  beat: number;
  endBeat?: number;
  column?: string;
  noteType?: string;
}

/** Precomputed density entry for one measure — color resolved by caller */
export interface MinimapDensityEntry {
  /** 0.0 – 1.0 normalized density */
  normalized: number;
  /** Pre-computed CSS color string (e.g. from densityToColor()) */
  color: string;
  /** Beat at which this measure starts */
  startBeat: number;
  /** Beat at which this measure ends */
  endBeat: number;
}

/** Bookmark entry for minimap marker rendering */
export interface MinimapBookmark {
  beat: number;
  name: string;
  color?: string;
}

interface MinimapProps {
  notes: MinimapNote[];
  totalBeats: number;
  currentBeat: number;
  viewportBeats: number;
  onNavigate: (beat: number) => void;
  className?: string;
  /** Optional per-measure density heatmap data */
  densityData?: MinimapDensityEntry[];
  /** Optional bookmark markers */
  bookmarks?: MinimapBookmark[];
  /** Hide the internal "Minimap" header label (e.g. when shown in a popout with its own title) */
  hideHeader?: boolean;
}

export const Minimap = React.memo(function Minimap({
  notes,
  totalBeats,
  currentBeat,
  viewportBeats,
  onNavigate,
  className,
  densityData,
  bookmarks,
  hideHeader,
}: MinimapProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 120, h: 192 });
  const isDraggingRef = useRef(false);

  // Build sorted unique lane list from notes (stable order: SC first, numbers, FZ last)
  const laneOrder = useMemo(() => {
    const cols = new Set<string>();
    for (const n of notes) if (n.column) cols.add(n.column);
    const arr = Array.from(cols);
    const order = (c: string) => {
      if (c === 'SC') return -1;
      if (c === 'FZ') return 100;
      const num = parseInt(c);
      return isNaN(num) ? 50 : num;
    };
    arr.sort((a, b) => order(a) - order(b));
    return arr;
  }, [notes]);

  // column → normalized x [0..1]
  const colPosMap = useMemo(() => {
    const map = new Map<string, number>();
    const count = laneOrder.length;
    if (count === 0) return map;
    laneOrder.forEach((col, i) => {
      map.set(col, (i + 0.5) / count);
    });
    return map;
  }, [laneOrder]);

  // Observe container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setSize({ w: Math.floor(width), h: Math.floor(height) });
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Render minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = size.w;
    const ch = size.h;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const safeTotalBeats = Math.max(totalBeats, 1);
    const scale = ch / safeTotalBeats;
    const laneCount = laneOrder.length || 1;
    const DENSITY_BAR_WIDTH = 8;
    const hasDensity = densityData && densityData.length > 0;
    const padX = hasDensity ? DENSITY_BAR_WIDTH + 2 : 2;
    const laneW = Math.max((cw - padX - 2) / laneCount, 2);

    // Background
    ctx.fillStyle = '#0c0c18';
    ctx.fillRect(0, 0, cw, ch);

    // ── Density heatmap bar (left 8px strip) ──────────────────────────────
    if (hasDensity) {
      for (const entry of densityData!) {
        if (entry.normalized <= 0) continue;
        const y1 = ch - entry.endBeat * scale;
        const y2 = ch - entry.startBeat * scale;
        const stripH = Math.max(y2 - y1, 1);
        ctx.fillStyle = entry.color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(0, y1, DENSITY_BAR_WIDTH, stripH);
      }
      ctx.globalAlpha = 1;
      // 1px separator line between density bar and note area
      ctx.strokeStyle = '#2a2a44';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(DENSITY_BAR_WIDTH, 0);
      ctx.lineTo(DENSITY_BAR_WIDTH, ch);
      ctx.stroke();
    }

    // Lane backgrounds (subtle alternating)
    for (let i = 0; i < laneOrder.length; i++) {
      const x = padX + i * laneW;
      ctx.fillStyle = i % 2 === 0 ? '#10101e' : '#141428';
      ctx.globalAlpha = densityData && densityData.length > 0 ? 0.55 : 1;
      ctx.fillRect(x, 0, laneW, ch);
    }
    ctx.globalAlpha = 1;

    // Measure lines (every 4 beats)
    ctx.strokeStyle = '#2a2a44';
    ctx.lineWidth = 0.5;
    for (let beat = 0; beat <= safeTotalBeats; beat += 4) {
      const y = ch - beat * scale;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
    }

    // Notes — use thin lines when density is high to avoid solid color blocks
    const noteH = Math.max(scale * 0.12, 1); // min 1px height
    // Compute density: if average pixel gap between notes is tiny, lower opacity
    const avgPixelPerNote = (ch * laneCount) / Math.max(notes.length, 1);
    const denseAlpha = avgPixelPerNote < 3 ? 0.55 : avgPixelPerNote < 6 ? 0.7 : 0.9;

    for (const note of notes) {
      if (!note.column) continue;
      const pos = colPosMap.get(note.column);
      if (pos === undefined) continue;

      const laneIdx = laneOrder.indexOf(note.column);
      const x = padX + laneIdx * laneW + 1.5;
      const w = laneW - 3;
      const y = ch - note.beat * scale - noteH;

      // Color by type
      let color: string;
      switch (note.noteType) {
        case 'landmine':
          color = '#ff4444';
          break;
        case 'invisible':
          color = '#555566';
          break;
        case 'bgm':
          color = '#444455';
          break;
        default:
          color = LANE_COLORS[note.column!] || DEFAULT_NOTE_COLOR;
      }

      // Long note body
      if (note.endBeat !== undefined && note.endBeat > note.beat) {
        const endY = ch - note.endBeat * scale;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(x, endY, w, y + noteH - endY);
        ctx.globalAlpha = 1;
      }

      // Note head
      ctx.fillStyle = color;
      ctx.globalAlpha = denseAlpha;
      ctx.fillRect(x, y, w, noteH);
      ctx.globalAlpha = 1;
    }

    // Dimming outside viewport (darken everything except the current viewport range)
    const vpTop = ch - (currentBeat + viewportBeats) * scale;
    const vpBottom = ch - currentBeat * scale;
    const vpH = vpBottom - vpTop;

    // Dim above viewport
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    if (vpTop > 0) ctx.fillRect(0, 0, cw, vpTop);
    // Dim below viewport
    if (vpBottom < ch) ctx.fillRect(0, vpBottom, cw, ch - vpBottom);

    // Viewport border
    ctx.strokeStyle = '#6699ff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.5, vpTop + 0.5, cw - 1, Math.max(vpH - 1, 2));

    // Bright top/bottom lines for viewport
    ctx.strokeStyle = '#88bbff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, vpTop);
    ctx.lineTo(cw, vpTop);
    ctx.moveTo(0, vpBottom);
    ctx.lineTo(cw, vpBottom);
    ctx.stroke();

    // ── Bookmark markers ────────────────────────────────────────────────────
    if (bookmarks && bookmarks.length > 0) {
      for (const bm of bookmarks) {
        const y = ch - bm.beat * scale;
        const bmColor = bm.color || '#ffcc44';
        // Horizontal marker line across full width
        ctx.strokeStyle = bmColor;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cw, y);
        ctx.stroke();
        // Right-aligned name text
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = bmColor;
        ctx.globalAlpha = 1;
        const maxTextWidth = cw - 4;
        let displayName = bm.name;
        while (ctx.measureText(displayName).width > maxTextWidth && displayName.length > 1) {
          displayName = displayName.slice(0, -1);
        }
        ctx.fillText(displayName, cw - 2, y - 2);
      }
      ctx.globalAlpha = 1;
    }
  }, [notes, totalBeats, currentBeat, viewportBeats, size, laneOrder, colPosMap, densityData, bookmarks]);

  // Click/drag to navigate (clamp to valid scroll range to prevent feedback oscillation)
  const navigateFromEvent = useCallback(
    (clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const y = clientY - rect.top;
      const scale = size.h / Math.max(totalBeats, 1);
      const beat = (size.h - y) / scale - viewportBeats / 2;
      // Clamp to exact valid range (same as EditorCanvas maxScroll)
      const maxScroll = Math.max(0, totalBeats - viewportBeats + 4);
      onNavigate(Math.max(0, Math.min(maxScroll, beat)));
    },
    [totalBeats, viewportBeats, onNavigate, size.h],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      isDraggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      navigateFromEvent(e.clientY);
    },
    [navigateFromEvent],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDraggingRef.current) return;
      navigateFromEvent(e.clientY);
    },
    [navigateFromEvent],
  );

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {!hideHeader && (
        <div className="px-2 py-1 text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 shrink-0">
          {t('panels.minimap.title')}
        </div>
      )}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="cursor-pointer block w-full h-full"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          title={t('panels.minimap.navigationTooltip')}
        />
      </div>
    </div>
  );
});

export default Minimap;
