import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import type { CardEffect } from '../card-effects'

const CARD_ID = 'D134_OysterEater'
/**
 * D134 Oyster Eater (Occupation, D, 134)
 * Each time the Fishing accumulation space is used (by any player), the card owner
 * gets 1 bonus SCORE and must skip placing their next person that round.
 *
 * Rule: onPlayerAfterPlaceFarmer / onOpponentAfterPlaceFarmer on actionCardType Fishing.
 *  - gainNode(SCORE => 1) to owner
 *  - SPECIAL_EFFECT skipNextPlacement (Globals::setSkipNext)
 *
 * Implementation notes:
 * - The bonus VP is credited via the `bonus-vp` leaf flow (accumulates in
 *   player.cardStates[CARD_ID].counters.bonusVp and is picked up at scoring).
 * - The "must skip next placement" side effect is stored in
 *   `cardStates.D134.extraData.skipNextPlacement` (count remaining). The
 *   `onBeforePlayerTurn` hook reads this flag at the start of each labor
 *   turn for the owner, decrements it by 1, and returns `{ skipTurn: true }`
 *   so the engine advances to the next eligible player. Mirrors the reference
 *   `Globals::setSkipNext` consumed in `stLabor()`.
 */
const listener: CardListenerRegistration = {
  id: 'D134-oyster-eater-after-fishing',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    const owner = context.ownerPlayer ?? context.player
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'increment-extra-data', key: 'skipNextPlacement', amount: 1 },
            actionContext: { targetPlayerId: owner.id },
          },
          {
            type: 'leaf',
            actionId: 'bonus-vp',
            sourceCard: CARD_ID,
            actionContext: { targetPlayerId: owner.id },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const effect: CardEffect = {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    const extra = player.cardStates?.[CARD_ID]?.extraData
    if (extra) delete extra.skipNextPlacement
  },
  onBeforePlayerTurn: (_state, player) => {
    const remaining = (player.cardStates?.[CARD_ID]?.extraData as { skipNextPlacement?: number } | undefined)
      ?.skipNextPlacement ?? 0
    if (remaining <= 0) return
    const cs = player.cardStates![CARD_ID]!
    const extra = (cs.extraData ?? {}) as { skipNextPlacement?: number }
    const next = remaining - 1
    if (next <= 0) {
      delete extra.skipNextPlacement
    } else {
      extra.skipNextPlacement = next
    }
    cs.extraData = extra
    return { skipTurn: true }
  },
}

const cardImpl = {
  listeners: [listener],
  effect,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D134_OysterEater = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Oyster Eater',
    deck: 'D',
    number: 134,
    category: 'POINTS_PROVIDER',
    desc: ['Each time the __Fishing__ accumulation space is used, you get 1 bonus <SCORE> and must skip placing your next person that round. (You can place the person on a later turn.)'],
    cost: {},
    players: '3+',
    extraVp: true,
  },
  impl: cardImpl,
})

export const D134_OysterEater_impl = D134_OysterEater.impl
