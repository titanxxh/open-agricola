import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payThenGainActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D119_WoodBarterer'

const beforeListener: CardListenerRegistration = {
  id: 'D119-wood-barterer-before-fence-construct',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['fence', 'construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    return {
      flow: {
        type: 'xor',
        optional: true,
        promptKey: 'ui.interactionWoodBartererPrompt',
        children: [
          gainLeaf(CARD_ID, { wood: 2 }, 'ui.interactionWoodBarterer2Wood'),
          payThenGainActionFlow({
            cardId: CARD_ID,
            cost: { wood: 1 },
            gain: { reed: 1 },
            choiceLabelKey: 'ui.interactionWoodBartererTrade1',
          }),
          payThenGainActionFlow({
            cardId: CARD_ID,
            cost: { wood: 2 },
            gain: { reed: 2 },
            choiceLabelKey: 'ui.interactionWoodBartererTrade2',
          }),
        ],
      },
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'D119-wood-barterer-isdoable',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['fence', 'construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.trueAction === false) return
    return { doable: true }
  },
}

export const D119_WoodBarterer = new Occupation({
  id: CARD_ID,
  name: "Wood Barterer",
  deck: "D",
  number: 119,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time before you use an action space with a __Build Fences__ or __Build Rooms__ action, you can choose to either get 2 <WOOD> or exchange up to 2 <WOOD> for 1 <REED> each."],
  cost: {},
  players: "1+",
})

export const D119_WoodBarterer_impl = {
  listeners: [beforeListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
