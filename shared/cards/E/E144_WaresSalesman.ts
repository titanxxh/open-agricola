import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { getCardDefinitionById } from '../helpers/card-type'

const CARD_ID = 'E144_WaresSalesman'

/**
 * E144 Wares Salesman:
 * Each time any player (including you) plays or builds a card that lets them
 * turn building resources into food, the card owner gets 1 of the corresponding
 * building resource and 1 reed (from the general supply).
 *
 * The reference uses a hardcoded grouping of cards to building resources (the card itself
 * does not always have that resource in its cost). Some cards belong to
 * multiple groups; in that case the owner chooses via xor.
 */

type ResourceGain = Partial<Resource>

const stripPrefix = (choice: string): string =>
  choice.replace(/^(minor|major):/, '')

const getGainsFor = (cardId: string): ResourceGain[] => {
  return [...(getCardDefinitionById(cardId)?.waresSalesmanGains ?? [])]
}

const buildFlow = (cardId: string): ActionFlow | null => {
  const gains = getGainsFor(cardId)
  if (gains.length === 0) return null
  if (gains.length === 1) return gainLeaf(CARD_ID, gains[0]!)
  return {
    type: 'xor',
    children: gains.map((g) => gainLeaf(CARD_ID, g)),
  }
}

const makeListener = (
  actionList: string[],
  listenerId: string,
): CardListenerRegistration => ({
  id: listenerId,
  cardIds: [CARD_ID],
  actions: actionList,
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.choice) return
    const flow = buildFlow(stripPrefix(context.choice))
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
})

const cardImpl = {
  listeners: [makeListener(
    ['improvement'],
    'E144-wares-salesman-after-improvement',
  ), makeListener(['occupation'], 'E144-wares-salesman-after-occupation')],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E144_WaresSalesman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Wares Salesman',
    deck: 'E',
    number: 144,
    category: 'BUILDING_RESOURCES_-_REED',
    desc: [
        'Each time any player (including you) plays or builds a card that lets them turn building resources into <FOOD>, you get exactly 1 corresponding building resource and 1 <REED>.',
      ],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const E144_WaresSalesman_impl = E144_WaresSalesman.impl
