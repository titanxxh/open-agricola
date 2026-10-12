import { readCardExtraData } from '../helpers/card-state'
import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { consumePlannedTurnSkip } from '../../actions/rule-activated-operation'
import type { RuleActivatedOperation } from '../../contract/rule-activated-operations'
import type { CardEffect } from '../card-effects'

const CARD_ID = 'D134_OysterEater'
const skipOperation = { kind: 'skip-next-turns', countFact: 'skipNextPlacement' } satisfies RuleActivatedOperation
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
            params: { kind: 'set-extra-data', key: 'skipNextPlacement', value: (readCardExtraData<number>(owner, CARD_ID, 'skipRound') === context.state.round ? readCardExtraData<number>(owner, CARD_ID, 'skipNextPlacement') ?? 0 : 0) + 1 },
            actionContext: { targetPlayerId: owner.id },
          },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-extra-data', key: 'skipRound', value: context.state.round }, actionContext: { targetPlayerId: owner.id } },
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
  timedRules: [{ retainAfterCardLeaves: true, key: 'next-turn-placement-skip', at: { kind: 'card-positive', fact: 'skipNextPlacement', roundFact: 'skipRound', clock: 'current-round', phase: 'onBeforePlayerTurn' }, body: { kind: 'operation', operation: skipOperation } }],
  onBeforePlayerTurn: (_state, player) => consumePlannedTurnSkip(player, CARD_ID, skipOperation) ? { skipTurn: true } : undefined,
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
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const D134_OysterEater_impl = D134_OysterEater.impl
