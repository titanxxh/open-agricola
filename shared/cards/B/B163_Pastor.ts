import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { isCardFlagged } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B163_Pastor } from '../../cards-display/B/B163_Pastor'

const CARD_ID = B163_Pastor.id

/** Shared predicate + flow used by both `effect.onBuy` and the after-construct
 *  listener — mirrors BGA's `onBuy($p) { return $this->onAfterConstruct(...) }`. */
const evaluatePastorTrigger = (
  state: GameState,
  ownerPlayer: PlayerState,
): ActionFlow | null => {
  if (isCardFlagged(ownerPlayer, CARD_ID)) return null
  if (ownerPlayer.rooms !== 2) return null
  const othersWith2Rooms = (state.players ?? []).filter(
    (p) => p.id !== ownerPlayer.id && p.rooms === 2,
  )
  if (othersWith2Rooms.length > 0) return null
  return {
    type: 'seq',
    children: [
      gainLeaf(CARD_ID, { wood: 3, clay: 2, reed: 1, stone: 1 }),
      { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
    ],
  }
}

/**
 * B163 Pastor — One-time trigger: after any player constructs a room,
 * if the card owner is the only player with exactly 2 rooms, the owner
 * gets 3 wood + 2 clay + 1 reed + 1 stone.
 *
 * Scope: 'any' — we check all construction events (owner or opponents).
 * Uses flag-card to ensure one-time effect.
 */
const listener: CardListenerRegistration = {
  id: 'B163-pastor-after-construct',
  cardIds: [CARD_ID],
  actions: ['construct'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const ownerPlayer = context.ownerPlayer
    if (!ownerPlayer) return
    const flow = evaluatePastorTrigger(context.state, ownerPlayer)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

export const B163_Pastor_impl = {
  listeners: [listener],
  effect: {
    id: CARD_ID,
    // BGA: `onBuy($p) { return $this->onAfterConstruct($p, []) }` — purchasing
    // the card triggers the same evaluation as a construct event, so a player
    // who is already alone at 2 rooms when buying gets the bonus immediately.
    onBuy: (state, player) => evaluatePastorTrigger(state, player) ?? undefined,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
