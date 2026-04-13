import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { getNextEmptyTileForPlayer } from '../../game/farm'

const CARD_ID = 'E148_Lazybones'
const MAX_STABLES = 4
const TRIGGER_SPACES = ['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion']

/**
 * Count stables in reserve: total supply (4) minus those on farm and those
 * already placed on action spaces via this card.
 */
const countStablesInReserve = (player: import('../../game/types').PlayerState): number => {
  const onFarm = player.stableTiles.length
  const onSpaces = (readCardExtraData<string[]>(player, CARD_ID, 'spaces') ?? []).length
  return Math.max(0, MAX_STABLES - onFarm - onSpaces)
}

/**
 * onBuy: auto-place stables on the 4 target action spaces (up to reserve count).
 * Stables leave the player's reserve and are tracked in cardStates extraData.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const reserve = countStablesInReserve(player)
    if (reserve === 0) return
    const placedSpaces = TRIGGER_SPACES.slice(0, Math.min(TRIGGER_SPACES.length, reserve))
    writeCardExtraData(player, CARD_ID, 'spaces', placedSpaces)
  },
})

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

    const spaces = readCardExtraData<string[]>(ownerPlayer, CARD_ID, 'spaces')
    if (!spaces?.includes(spaceId)) return

    // Remove this space from the list (stable collected)
    const newSpaces = spaces.filter((s) => s !== spaceId)
    writeCardExtraData(ownerPlayer, CARD_ID, 'spaces', newSpaces)

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

registerCardListener(listener)

export const E148_Lazybones = new Occupation({
  id: CARD_ID,
  name: 'Lazybones',
  deck: 'E',
  number: 148,
  desc: ['Place (up to) 1 <STABLE> each on __Grain Seeds__, __Farmland__, __Day Laborer__, and __Farm Expansion__. Build the <STABLE> at no cost when another player uses that action space.'],
  cost: {},
  players: '4+',
})
