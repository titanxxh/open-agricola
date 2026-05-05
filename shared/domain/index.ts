export { PlayerBoard, playerBoard } from './player-board.ts'
export { Farmyard, type FarmSelectKind, type FenceSpec } from './farmyard.ts'
export { AnimalZones, type AnimalZone } from './animal-zones.ts'
export { computePasturesFromFences, type Pasture } from './pasture.ts'
export {
  Scoring,
  type PlayerScoreSummary,
  type ScoreCategoryResult,
  type ScoreEntry,
} from './scoring.ts'

// Re-export of small leaf helpers/types from `shared/logic/farm/*` that
// PR2/PR3 didn't surface but PR4 callers need so they can drop direct
// `logic/farm/*` imports. PR5 will inline these definitions into the
// domain modules themselves and delete the legacy files; for now the
// re-export keeps the facade as the single import point for callers.
export type { SowSelection } from '../logic/farm/sow-validation.ts'
export { getAllEdgeIds } from '../logic/farm/fence-validation.ts'
