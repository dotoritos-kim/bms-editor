/**
 * laneUtils.ts
 * Lane option application utilities extracted from NoteChartViewer (Stage G).
 */

import type { LaneConfig } from '../laneConfig';
import { mulberry32 } from './renderers/viewerRenderUtils';

/** Lane option */
export type LaneOption = 'normal' | 'mirror' | 'random' | 'r-random' | 's-random';

/** Apply lane option */
export function applyLaneOption(lanes: LaneConfig[], option: LaneOption, seed?: number): LaneConfig[] {
  if (option === 'normal') return lanes;

  // Separate scratch/FZ lanes (only shuffle playable lanes)
  const playableLanes = lanes.filter(l => !l.isScratch && !l.isBgm && l.id !== 'FZ' && l.id !== 'FZ2');

  let arrangedLanes: LaneConfig[];

  switch (option) {
    case 'mirror':
      arrangedLanes = [...playableLanes].reverse();
      break;
    case 'random':
    case 'r-random':
    case 's-random': {
      // Fisher-Yates shuffle
      const shuffled = [...playableLanes];
      const rng = seed ? mulberry32(seed) : Math.random;
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      arrangedLanes = shuffled;
      break;
    }
    default:
      arrangedLanes = playableLanes;
  }

  // Restore scratch lanes to their original positions
  const result: LaneConfig[] = [];
  let playableIndex = 0;

  for (const original of lanes) {
    if (original.isScratch || original.isBgm || original.id === 'FZ' || original.id === 'FZ2') {
      result.push(original);
    } else {
      const arranged = arrangedLanes[playableIndex++];
      result.push({ ...arranged, x: original.x });
    }
  }

  // Recalculate x coordinates
  let x = 0;
  return result.map(lane => {
    const updated = { ...lane, x };
    x += lane.width;
    return updated;
  });
}
