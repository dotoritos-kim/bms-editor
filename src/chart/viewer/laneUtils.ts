/**
 * laneUtils.ts
 * Lane option application utilities extracted from NoteChartViewer (Stage G).
 */

import type { LaneConfig } from '../laneConfig';
import { mulberry32 } from './renderers/viewerRenderUtils';

/** 레인 옵션 */
export type LaneOption = 'normal' | 'mirror' | 'random' | 'r-random' | 's-random';

/** 레인 옵션 적용 */
export function applyLaneOption(lanes: LaneConfig[], option: LaneOption, seed?: number): LaneConfig[] {
  if (option === 'normal') return lanes;

  // 스크래치/FZ 레인 분리 (playableLanes만 셔플)
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

  // 원래 위치에 스크래치 레인 복원
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

  // x 좌표 재계산
  let x = 0;
  return result.map(lane => {
    const updated = { ...lane, x };
    x += lane.width;
    return updated;
  });
}
