/**
 * Minimap.tsx
 * Canvas-2D minimap overlay for NoteChartViewer.
 * Extracted from NoteChartViewer.tsx (Stage E).
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { Map as MapIcon } from 'lucide-react';
import type { BMSNote } from '@rhythm-archive/bms-core';
import type { Positioning } from '@rhythm-archive/bms-core';
import type { LaneConfig } from '../../laneConfig';
import type { NoteTypeFilter } from '../../NoteChartViewer';
import { useI18n } from '../../../i18n';

export function Minimap({
  notes,
  lanes,
  maxBeat,
  currentBeat,
  viewportBeats,
  onClick,
  noteTypeFilter,
  isPlaying,
  judgmentLinePosition,
  positioning,
}: {
  notes: BMSNote[];
  lanes: LaneConfig[];
  maxBeat: number;
  currentBeat: number;
  viewportBeats: number;
  onClick: (beat: number) => void;
  noteTypeFilter: NoteTypeFilter;
  isPlaying: boolean;
  judgmentLinePosition: number;
  positioning?: Positioning | null;
}) {
  const { t } = useI18n();

  const getMinimapPosition = useCallback((beat: number) => {
    return positioning ? positioning.position(beat) : beat;
  }, [positioning]);

  const maxPosition  = positioning ? positioning.position(maxBeat) : maxBeat;
  const minimapRef   = useRef<HTMLDivElement>(null);
  const laneWidth    = lanes.reduce((sum, l) => sum + l.width, 0);
  const minimapWidth  = Math.min(laneWidth * 0.4, 120);
  const minimapHeight = 300;
  const scale = minimapHeight / maxPosition;

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, minimapWidth, minimapHeight);

    const laneMap  = new Map(lanes.map(l => [l.id, l]));
    const laneScale = minimapWidth / laneWidth;

    lanes.forEach(lane => {
      const x = (lane.x + lane.width) * laneScale;
      ctx.strokeStyle = '#333366';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, minimapHeight);
      ctx.stroke();
    });

    const totalMeasures = Math.ceil(maxBeat / 4);
    for (let m = 0; m <= totalMeasures; m++) {
      const measurePosition = getMinimapPosition(m * 4);
      const y = minimapHeight - (measurePosition * scale);
      ctx.strokeStyle = m % 4 === 0 ? '#555588' : '#333355';
      ctx.lineWidth   = m % 4 === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(minimapWidth, y);
      ctx.stroke();
    }

    notes.forEach(note => {
      if (!note.column) return;
      const type = note.noteType || 'playable';
      if (!noteTypeFilter[type as keyof NoteTypeFilter]) return;
      const lane = laneMap.get(note.column);
      if (!lane) return;

      const x            = (lane.x + 1) * laneScale;
      const notePosition = getMinimapPosition(note.beat);
      const y            = minimapHeight - (notePosition * scale);
      const width        = (lane.width - 2) * laneScale;
      const height       = note.endBeat !== undefined
        ? Math.abs(getMinimapPosition(note.endBeat) - notePosition) * scale
        : Math.max(2, scale * 0.5);

      let color = lane.color;
      if (type === 'landmine')  color = '#ff4444';
      else if (type === 'invisible') color = lane.color + '44';
      else if (type === 'bgm')  color = '#666666';

      ctx.fillStyle = color;
      if (note.endBeat !== undefined) {
        ctx.fillRect(x, y - height, width, height);
      } else {
        ctx.fillRect(x, y - 1, width, 2);
      }
    });

    const viewportHeightMini = viewportBeats * scale;
    const currentPosition    = getMinimapPosition(currentBeat);
    const currentBeatY       = minimapHeight - (currentPosition * scale);

    let topOffset: number, bottomOffset: number;
    if (isPlaying) {
      topOffset    = viewportHeightMini * (1 - judgmentLinePosition);
      bottomOffset = viewportHeightMini * judgmentLinePosition;
    } else {
      topOffset    = viewportHeightMini / 2;
      bottomOffset = viewportHeightMini / 2;
    }

    const viewportTopY    = currentBeatY - topOffset;
    const viewportBottomY = currentBeatY + bottomOffset;

    ctx.fillStyle = 'rgba(255, 102, 0, 0.2)';
    ctx.fillRect(0, viewportTopY, minimapWidth, viewportBottomY - viewportTopY);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, viewportTopY, minimapWidth, viewportBottomY - viewportTopY);

    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, currentBeatY);
    ctx.lineTo(minimapWidth, currentBeatY);
    ctx.stroke();
  }, [notes, lanes, maxBeat, currentBeat, viewportBeats, minimapWidth, minimapHeight, scale, laneWidth, noteTypeFilter, isPlaying, judgmentLinePosition, getMinimapPosition]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const beat = (minimapHeight - y) / scale;
    onClick(Math.max(0, Math.min(maxBeat, beat)));
  }, [scale, maxBeat, onClick, minimapHeight]);

  return (
    <div
      ref={minimapRef}
      className="absolute right-2 top-2 z-20 rounded-lg overflow-hidden border border-border/50 bg-background/80 backdrop-blur-sm shadow-lg"
    >
      <div className="text-xs text-center py-1 px-2 bg-muted/50 border-b text-muted-foreground flex items-center gap-1 justify-center">
        <MapIcon className="h-3 w-3" />
        Minimap
      </div>
      <canvas
        ref={canvasRef}
        width={minimapWidth}
        height={minimapHeight}
        onClick={handleClick}
        className="cursor-pointer"
        title={t('viewer.timeline.clickToSeek')}
      />
      <div className="text-xs text-center py-1 px-2 bg-muted/50 border-t text-muted-foreground">
        {Math.floor(currentBeat / 4)}/{Math.floor(maxBeat / 4)} 마디
      </div>
    </div>
  );
}
