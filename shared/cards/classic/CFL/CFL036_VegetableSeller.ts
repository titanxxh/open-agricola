import type { ActionFlow } from '../../../contract/types'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { defineOccupationCard } from '../../card-source'
import { gainLeaf, payLeaf } from '../../helpers/pay-gain-node'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CFL036_VegetableSeller'
const REPAY = 'card_CFL036_VegetableSeller_repay'
const DEBT = 'borrowedVegetables'
const conversion = { from: { vegetable: 1 }, to: { food: 2 }, sourceId: CARD_ID }

registerAdHocAction({
  id: REPAY,
  nameKey: 'cards.CFL036_VegetableSeller.repay',
  descriptionKey: 'cards.CFL036_VegetableSeller.repay',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => (player.cardStates[CARD_ID]?.counters?.[DEBT] ?? 0) > 0,
  execute: ({ player }) => {
    const debt = player.cardStates[CARD_ID]?.counters?.[DEBT] ?? 0
    const vegetables = Math.min(debt, player.resources.vegetable)
    const children: ActionFlow[] = []
    if (vegetables > 0) children.push(payLeaf({ cardId: CARD_ID, cost: { vegetable: vegetables } }))
    if (debt > vegetables) children.push(gainLeaf(CARD_ID, { begging: debt - vegetables }))
    children.push({ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-counter', key: DEBT, value: 0 } })
    return { type: 'flow', flow: { type: 'seq', children } }
  },
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBeforeEndGame: (_state, player) => (player.cardStates[CARD_ID]?.counters?.[DEBT] ?? 0) > 0
      ? { type: 'leaf', actionId: REPAY, sourceCard: CARD_ID } : undefined,
  },
  listeners: [{
    id: CARD_ID + '-borrow',
    cardIds: [CARD_ID],
    actions: ['anytime'],
    phases: ['anytime'],
    handler: ({ state }) => {
      // Animal placement can open a new anytime window even after final settlement.
      if (state.round === 14 && state.roundPhase === 'preparation'
        && state.events.some(event => event.type === 'harvest.started' && event.round === state.round)) return
      return {
        labelKey: 'cards.CFL036_VegetableSeller.borrow',
        flow: { type: 'seq', children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'increment-counter', key: DEBT, amount: 1 } },
          // The borrowed vegetable is converted directly from the general supply.
          { type: 'leaf', actionId: 'exchange', sourceCard: CARD_ID, actionContext: { directTrade: { ...conversion, from: {} } } },
        ] },
      }
    },
  }],
} satisfies CardImpl

export const CFL036_VegetableSeller = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Vegetable Seller',
    deck: 'CFL',
    artUrl: 'assets/classic/CFL/CFL036.png',
    number: 36,
    players: '1+',
    desc: ['At any time, you can convert 1 <VEGETABLE> from your supply or borrowed from the general supply into 2 <FOOD>. For each borrowed <VEGETABLE> not returned before scoring, receive 1 begging card.'],
    exchanges: [{ ...conversion, triggers: ['anytime', 'harvest'] }],
  },
  presentation: { counters: [DEBT] },
  impl: cardImpl,
})
