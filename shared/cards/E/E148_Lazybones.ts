import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import {
  getReservedActionSpaces,
  setReservedActionSpaces,
} from '../helpers/card-state'
import { getNextEmptyTileForPlayer } from '../../game/farm'
import type { CardImpl } from '../registry'

const CARD_ID = 'E148_Lazybones'
const MAX_STABLES = 4
const TRIGGER_SPACES = ['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion']

/**
 * Count stables in reserve: total supply (4) minus those on farm and those
 * already placed on action spaces via this card.
 */
const countStablesInReserve = (player: import('../../contract/types').PlayerState): number => {
  const onFarm = player.stableTiles.length
  const onSpaces = getReservedActionSpaces(player, CARD_ID).length
  return Math.max(0, MAX_STABLES - onFarm - onSpaces)
}

/**
 * Opponent listener: when another player uses one of the marked action spaces,
 * the Lazybones owner receives the stable for free (built on their farm).
 */
const listener: CardListenerRegistration = {
  id: 'E148-lazybones-opponent-trigger',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !TRIGGER_SPACES.includes(spaceId)) return

    // Find the card owner (the opponent relative to the acting player)
    const ownerPlayer = context.ownerPlayer ?? context.state.players.find(
      (p) => p.id !== context.player.id && p.occupationPlayed.includes(CARD_ID),
    )
    if (!ownerPlayer) return

    const spaces = getReservedActionSpaces(ownerPlayer, CARD_ID)
    if (!spaces.includes(spaceId)) return

    // Remove this space from the list (stable collected)
    setReservedActionSpaces(ownerPlayer, CARD_ID, spaces.filter((s) => s !== spaceId))

    // Build the stable directly on the owner's farm
    const tile = getNextEmptyTileForPlayer(ownerPlayer)
    if (!tile) return // No empty tile available

    ownerPlayer.stableTiles.push(tile)

    return {
      logKey: 'log.cardEffectGain',
      logParams: { cardId: CARD_ID, gain: '1 STABLE' },
      sourceCard: CARD_ID,
    }
  },
}

export const E148_Lazybones = new Occupation({
  id: CARD_ID,
  name: 'Lazybones',
  deck: 'E',
  number: 148,
  desc: ['Place (up to) 1 <STABLE> each on __Grain Seeds__, __Farmland__, __Day Laborer__, and __Farm Expansion__. Build the <STABLE> at no cost when another player uses that action space.'],
  cost: {},
  players: '4+',
})

export const E148_Lazybones_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const reserve = countStablesInReserve(player)
    if (reserve === 0) return
    const placedSpaces = TRIGGER_SPACES.slice(0, Math.min(TRIGGER_SPACES.length, reserve))
    setReservedActionSpaces(player, CARD_ID, placedSpaces)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
