import type { GameState, PlayerState } from '../../contract/types'
import { harvestRounds } from '../../contract/state-constants'
import { writeCardExtraData } from './card-state'

const SKIP_NEXT_HARVEST_KEY = 'skipNextHarvest'
const SKIP_HARVEST_ROUND_KEY = 'skipHarvestRound'
const HARVEST_PHASES = new Set<GameState['roundPhase']>([
  'harvest',
  'field',
  'feeding',
  'breeding',
])

export const scheduleNextHarvestSkip = (player: PlayerState, cardId: string): void => {
  writeCardExtraData(player, cardId, SKIP_NEXT_HARVEST_KEY, true)
}

export const activatePendingHarvestSkips = (state: GameState): void => {
  for (const player of state.players) {
    for (const cardState of Object.values(player.cardStates ?? {})) {
      const extraData = cardState.extraData
      if (extraData?.[SKIP_NEXT_HARVEST_KEY] !== true) continue
      delete extraData[SKIP_NEXT_HARVEST_KEY]
      extraData[SKIP_HARVEST_ROUND_KEY] = state.round
    }
  }
}

export const isPlayerSkippingCurrentHarvest = (
  state: GameState,
  player: PlayerState,
): boolean =>
  HARVEST_PHASES.has(state.roundPhase) && pendingHarvestSkips(state, player).some(entry => entry.round === state.round && player.cardStates[entry.cardId]?.extraData?.[SKIP_HARVEST_ROUND_KEY] === state.round)

export const pendingHarvestSkips = (state: GameState, player: PlayerState): { cardId: string; round: number }[] => {
  const next = harvestRounds.find(round => round >= state.round)
  return Object.entries(player.cardStates ?? {}).flatMap(([cardId, cardState]) => {
    if (cardState.extraData?.[SKIP_NEXT_HARVEST_KEY] === true && next !== undefined) return [{ cardId, round: next }]
    return HARVEST_PHASES.has(state.roundPhase) && cardState.extraData?.[SKIP_HARVEST_ROUND_KEY] === state.round ? [{ cardId, round: state.round }] : []
  })
}

export const fieldAndBreedSkipSources = (state: GameState, player: PlayerState): string[] => Object.entries(player.cardStates ?? {}).flatMap(([cardId, cardState]) => cardState.extraData?.passFieldAndBreedRound === state.round ? [cardId] : [])
