import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import {
  getReservedActionSpaces,
  setReservedActionSpaces,
} from '../helpers/card-state'
import { getNextEmptyTileForPlayer } from '../../domain/farm'
import type { CardImpl } from '../registry'
import { E148_Lazybones } from '../../cards-display/E/E148_Lazybones'

const CARD_ID = E148_Lazybones.id

const MAX_STABLES = 4

const TRIGGER_SPACES = ['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion']

const ownerSpecialEffect = (
  ownerPlayerId: string,
  params: Record<string, unknown>,
): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  actionContext: { targetPlayerId: ownerPlayerId },
  params,
})

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

    const tile = getNextEmptyTileForPlayer(ownerPlayer)
    const children: ActionFlow[] = [
      ownerSpecialEffect(ownerPlayer.id, {
        kind: 'set-extra-data',
        key: 'reservedActionSpaces',
        value: spaces.filter((s) => s !== spaceId),
      }),
    ]
    if (tile) {
      children.push(
        ownerSpecialEffect(ownerPlayer.id, {
          kind: 'build-stable-on-first-empty-tile',
        }),
      )
    }

    return {
      flow: children.length === 1 ? children[0] : { type: 'seq', children },
      ...(tile
        ? {
          }
        : { countCardUse: false }),
      sourceCard: CARD_ID,
    }
  },
}

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
