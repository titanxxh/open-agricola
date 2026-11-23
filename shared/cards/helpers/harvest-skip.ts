import type { GameState, PlayerState } from '../../contract/types'
import { harvestRounds } from '../../contract/state-constants'
import { writeCardExtraData } from './card-state'

const SKIP_NEXT_HARVEST_KEY = 'skipNextHarvest'
const SKIP_ACTIVATION_KEY = 'skipNextHarvestActivation'
const SKIP_HARVEST_ROUND_KEY = 'skipHarvestRound'

/**
 * When a scheduled whole-Harvest skip takes effect: before the start-of-Harvest
 * window (decided earlier, e.g. on play), or after it (decided in that window,
 * whose same-timing effects still fire).
 */
export type HarvestSkipActivation = 'before-start-of-harvest' | 'after-start-of-harvest'
const HARVEST_PHASES = new Set<GameState['roundPhase']>([
  'harvest',
  'field',
  'feeding',
  'breeding',
])

export const scheduleNextHarvestSkip = (
  player: PlayerState,
  cardId: string,
  activation: HarvestSkipActivation = 'before-start-of-harvest',
): void => {
  writeCardExtraData(player, cardId, SKIP_NEXT_HARVEST_KEY, true)
  if (activation === 'after-start-of-harvest') writeCardExtraData(player, cardId, SKIP_ACTIVATION_KEY, activation)
}

export const activatePendingHarvestSkips = (state: GameState, activation: HarvestSkipActivation): void => {
  for (const player of state.players) {
    for (const cardState of Object.values(player.cardStates ?? {})) {
      const extraData = cardState.extraData
      if (extraData?.[SKIP_NEXT_HARVEST_KEY] !== true) continue
      if ((extraData[SKIP_ACTIVATION_KEY] ?? 'before-start-of-harvest') !== activation) continue
      delete extraData[SKIP_NEXT_HARVEST_KEY]
      delete extraData[SKIP_ACTIVATION_KEY]
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
