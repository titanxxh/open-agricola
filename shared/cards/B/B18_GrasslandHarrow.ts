import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionFlow, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B18_GrasslandHarrow'
const TARGET_ROUND_KEY = 'targetRound'

/**
 * 7b1 PR-4 migration: queue the future field via an `actions: ['pay']`
 * after-listener gated on `sourceCard === CARD_ID` (only B18's own purchase
 * payment counts). Mirrors BGA `onPlayerAfterPay` semantics — reserve is
 * counted from supply *after* the play cost has been drained, matching the
 * legacy onBuy-time behaviour exactly because host action completion runs
 * internal `activate-card-effect` after pay.
 */
const afterPayListener: CardListenerRegistration = {
  id: 'B18-grassland-harrow-after-pay',
  phases: ['after' as ActionHookPhase],
  actions: ['pay'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    const result = context.result
    if (!result || result.type !== 'ok') return
    const supply = context.player.resources as Resource
    const reserve =
      (supply.wood ?? 0) +
      (supply.clay ?? 0) +
      (supply.stone ?? 0) +
      (supply.reed ?? 0)
    if (reserve <= 0) return
    const targetRound = Math.min(14, context.state.round + reserve)
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: TARGET_ROUND_KEY, value: targetRound },
          },
          futureMeeplesNode({
            cardId: CARD_ID,
            playerId: context.player.id,
            entries: [{ round: targetRound, resources: {} }],
          }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterPayListener],
  effect: {
  id: CARD_ID,
  // onBuy is intentionally a no-op: the after-pay listener queues the future
  // field. Keeping the entry so onRoundStart still binds via getCardEffect().
  onBuy: () => undefined,
  onRoundStart: (state, player) => {
    const targetRound = readCardExtraData<number>(player, CARD_ID, TARGET_ROUND_KEY)
    if (targetRound !== state.round) return
    writeCardExtraData(player, CARD_ID, TARGET_ROUND_KEY, undefined)
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
      ],
    } as ActionFlow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B18_GrasslandHarrow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Grassland Harrow',
    deck: 'B',
    number: 18,
    category: 'FARM_PLANNER',
    desc: [
        'Add 1 to the current round for each building resource in your supply and place 1 field on the corresponding round space. At the start of the round, you can plow the field.',
      ],
    cost: { wood: 2 },
    prerequisite: '2 Occ., 1 Resource After Payment',
    occupationPrerequisites: { min: 2 },
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const B18_GrasslandHarrow_impl = B18_GrasslandHarrow.impl
