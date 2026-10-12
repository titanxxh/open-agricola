export { PlayerBoard, playerBoard } from './player-board.ts'
export {
  Farmyard,
  type FenceSpec,
  type SowSelection,
  getAllEdgeIds,
  normalizePlayerFarm,
} from './farmyard.ts'
export {
  FarmInteraction,
  buildFarmPositionSelectionInteraction,
  buildFenceFarmInteraction,
  buildPlowFarmInteraction,
  buildRoomFarmInteraction,
  buildSowFarmInteraction,
  buildStableFarmInteraction,
  getPermittedExtraSowableFields,
  type FarmSelectKind,
} from './farmyard-interaction.ts'
export {
  AnimalZones,
  type AnimalZone,
  getTotalAnimalCapacity,
  isHouseAnimalZone,
  countHouseAnimals,
} from './animal-zones.ts'
export { getPastureViews, getPastureSize, getPastureStableCount, getPastureCapacity, getFencedStableCount, type Pasture } from './pasture.ts'
export {
  Scoring,
  type PlayerScoreSummary,
  type ScoreCategoryResult,
  type ScoreEntry,
} from './scoring.ts'
