import type { Pasture, PlayerState } from '../../../shared/contract/types'
import type { ActionChoiceOption } from '../../../shared/contract/types'
import type { GameState } from '../../../shared/contract/types'
import type { AnimalReorgState, PendingAnimalReorg, PendingChoice } from '../../types/ui'
import type { EngineProgress } from './use-engine-flow'

type AnimalTotals = {
  sheep: number
  boar: number
  cattle: number
}

export const applyAnimalReorgToPlayer = (params: {
  player: PlayerState
  animalReorg: AnimalReorgState
  totals: AnimalTotals
  getPastureCapacity: (pasture: Pasture) => number
}) => {
  const { player, animalReorg, totals, getPastureCapacity } = params
  const pastureZones = animalReorg.zones.filter((zone) => zone.zoneType === 'pasture')
  player.pastures = player.pastures.map((pasture) => {
    const assigned = pastureZones.find((zone) => zone.id === pasture.id)
    if (!assigned || !assigned.animalType) {
      return { ...pasture, animalType: null, animalCount: 0 }
    }
    const capacity = getPastureCapacity(pasture)
    const count = Math.max(0, Math.min(capacity, assigned.animalCount))
    return {
      ...pasture,
      animalType: count > 0 ? assigned.animalType : null,
      animalCount: count,
    }
  })
  const houseZone = animalReorg.zones.find((zone) => zone.zoneType === 'house')
  player.houseAnimalType = houseZone?.animalType ?? null
  player.houseAnimalCount = houseZone?.animalType && houseZone.animalCount > 0 ? 1 : 0
  const stableZones = animalReorg.zones.filter((zone) => zone.zoneType === 'stable')
  const stableAnimals: Record<string, 'sheep' | 'boar' | 'cattle' | null> = {}
  stableZones.forEach((zone) => {
    const key = zone.id.replace('stable:', '')
    stableAnimals[key] = zone.animalType ?? null
  })
  player.stableAnimals = stableAnimals
  player.resources.sheep = totals.sheep
  player.resources.boar = totals.boar
  player.resources.cattle = totals.cattle
}

const getReorgFenceExtraWood = (promptKey: string | undefined, spaceId: string) =>
  promptKey === 'ui.interactionFenceSelect' && spaceId === 'farm-redevelopment' ? 1 : 0

export const buildPendingChoiceFromReorgProgress = (
  progress: { promptKey?: string; choice: ActionChoiceOption[] },
  pendingAnimalReorg: PendingAnimalReorg,
): PendingChoice => ({
  promptKey: progress.promptKey,
  options: progress.choice,
  playerIndex: pendingAnimalReorg.playerIndex,
  spaceId: pendingAnimalReorg.spaceId,
  fenceExtraWood: getReorgFenceExtraWood(
    progress.promptKey,
    pendingAnimalReorg.spaceId,
  ),
})

export type PostReorgPlan =
  | { type: 'anytime' }
  | { type: 'harvestNextPlayer'; pendingPlayerIndex: number }
  | { type: 'harvestFinalize' }
  | { type: 'actionSpace'; hasTargetSpace: boolean }

export const buildPostReorgPlan = (params: {
  reorgSource: string
  nextState: GameState
  spaceId: string
  hasPendingAnimals: (player: GameState['players'][number]) => boolean
}): PostReorgPlan => {
  const { reorgSource, nextState, spaceId, hasPendingAnimals } = params
  if (reorgSource === 'anytime-reorg') {
    return { type: 'anytime' }
  }
  if (reorgSource === 'harvest-breed') {
    const pendingPlayerIndex = nextState.players.findIndex((player) =>
      hasPendingAnimals(player),
    )
    if (pendingPlayerIndex !== -1) {
      return { type: 'harvestNextPlayer', pendingPlayerIndex }
    }
    return { type: 'harvestFinalize' }
  }
  const hasTargetSpace = nextState.actionSpaces.some((item) => item.id === spaceId)
  return { type: 'actionSpace', hasTargetSpace }
}

export type ReorgEngineProgressPlan =
  | {
      type: 'choice'
      resetFenceSelection: boolean
      resetStableSelection: boolean
      pendingChoice: PendingChoice
    }
  | { type: 'fail'; logKey: string }
  | { type: 'reorg'; playerIndex: number; spaceId: string }
  | { type: 'advance'; pendingNextPlayerIndex: number }

export const buildReorgEngineProgressPlan = (params: {
  progress: EngineProgress
  pendingAnimalReorg: PendingAnimalReorg
  players: GameState['players']
  currentPlayerIndex: number
  nextPlayerIndex: (
    players: GameState['players'],
    currentIndex: number,
  ) => number
}): ReorgEngineProgressPlan => {
  const { progress, pendingAnimalReorg, players, currentPlayerIndex, nextPlayerIndex } =
    params
  if (progress.type === 'choice') {
    return {
      type: 'choice',
      resetFenceSelection: progress.promptKey === 'ui.interactionFenceSelect',
      resetStableSelection: progress.promptKey === 'ui.interactionStableSelect',
      pendingChoice: buildPendingChoiceFromReorgProgress(progress, pendingAnimalReorg),
    }
  }
  if (progress.type === 'fail') {
    return { type: 'fail', logKey: progress.logKey }
  }
  if (progress.type === 'reorg') {
    return {
      type: 'reorg',
      playerIndex: progress.playerIndex,
      spaceId: progress.spaceId,
    }
  }
  return {
    type: 'advance',
    pendingNextPlayerIndex: nextPlayerIndex(players, currentPlayerIndex),
  }
}
