import type { ActionFlow } from '../../contract/types'
import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payThenGainActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D119_WoodBarterer'
const containsBuildingAction = (flow: ActionFlow): boolean => flow.type === 'leaf'
  ? ['fence', 'construct'].includes(flow.actionId)
  : flow.children.some(containsBuildingAction)

const beforeListener: CardListenerRegistration = {
  id: 'D119-wood-barterer-before-placement',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    if (!context.space.flow || !containsBuildingAction(context.space.flow)) return
    return {
      flow: {
        type: 'xor',
        optional: true,
        promptKey: 'ui.interactionWoodBartererPrompt',
        children: [
          gainLeaf(CARD_ID, { wood: 2 }),
          payThenGainActionFlow({
            cardId: CARD_ID,
            cost: { wood: 1 },
            gain: { reed: 1 },
          }),
          payThenGainActionFlow({
            cardId: CARD_ID,
            cost: { wood: 2 },
            gain: { reed: 2 },
          }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [beforeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D119_WoodBarterer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Wood Barterer",
    deck: "D",
    number: 119,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Each time before you use an action space with a __Build Fences__ or __Build Rooms__ action, you can choose to either get 2 <WOOD> or exchange up to 2 <WOOD> for 1 <REED> each."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const D119_WoodBarterer_impl = D119_WoodBarterer.impl
