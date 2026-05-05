export { PlayerBoard, playerBoard } from './player-board.ts'
export {
  Farmyard,
  type FarmSelectKind,
  type FenceSpec,
  type SowSelection,
  getAllEdgeIds,
  normalizePlayerFarm,
} from './farmyard.ts'
export {
  AnimalZones,
  type AnimalZone,
  getTotalAnimalCapacity,
  getPastureCapacity,
} from './animal-zones.ts'
export { computePasturesFromFences, type Pasture } from './pasture.ts'
export {
  Scoring,
  type PlayerScoreSummary,
  type ScoreCategoryResult,
  type ScoreEntry,
} from './scoring.ts'
