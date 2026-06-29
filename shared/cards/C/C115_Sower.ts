import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { isMajorCardId } from '../helpers/card-type'

const CARD_ID = 'C115_Sower'
const updateInfobox = (reedCount: number): ActionFlow => {
  if (reedCount <= 0) {
    return {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-infobox', text: '' },
    }
  }
  return {
    type: 'leaf',
    actionId: 'special-effect',
    sourceCard: CARD_ID,
    params: { kind: 'set-infobox', text: `${reedCount} Reed` },
  }
}

/**
 * Listener 1: After playing a major improvement, place 1 reed on this card.
 */
const afterImprovementListener: CardListenerRegistration = {
  id: 'C115-sower-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice
    const cardId = choice?.replace(/^major:/, '').replace(/^minor:/, '')
    if (!cardId || !isMajorCardId(cardId)) return
    const newCount = getCardStack(context.player, CARD_ID).length + 1
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'push-to-card-stack', sourceCard: CARD_ID, params: { item: 'reed' } },
          updateInfobox(newCount),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

/**
 * Listener 2: Anytime — take reed OR exchange for sow action.
 * Guard: card stack has at least 1 reed.
 */
const anytimeListener: CardListenerRegistration = {
  id: 'C115-sower-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return

    const remainingAfterPop = stack.length - 1

    return {
      flow: {
        type: 'xor',
        children: [
          // Option A: Take the reed (pop gives it as a resource)
          {
            type: 'seq',
            children: [
              { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
              updateInfobox(remainingAfterPop),
            ],
          } as ActionFlow,
          // Option B: Exchange reed for a Sow action
          // pop-card-stack gives reed, then pay-resources takes it back, then sow
          {
            type: 'seq',
            children: [
              { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
              payLeaf({ cardId: CARD_ID, cost: { reed: 1 } }),
              updateInfobox(remainingAfterPop),
              { type: 'leaf', actionId: 'sow', sourceCard: CARD_ID, optional: true },
            ],
          } as ActionFlow,
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C115_Sower.anytime',
    }
  },
}

const cardImpl = {
  listeners: [afterImprovementListener, anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C115_Sower = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Sower',
    deck: 'C',
    number: 115,
    category: 'CROP_PROVIDER',
    desc: ['Each time you build a major improvement, place 1 <REED> from the general supply on this card. At any time, you can move the <REED> to your supply or exchange it for a __Sow__ action.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C115_Sower_impl = C115_Sower.impl
