import { isActionDoableInFlowContext } from '../../../actions/flow'
import { getActionDefinition } from '../../../actions/index'
import { emptyResources } from '../../../contract/state-constants'
import type { ActionFlow } from '../../../contract/types'
import { defineOccupationCard } from '../../card-source'
import { cardResourceWithdrawal } from '../../helpers/card-resource-withdrawal'
import { getStoredResource } from '../../helpers/card-storage'
import { jumpLeaf } from '../../helpers/jump-leaf'

const CARD_ID = 'CFL032_Elder'

export const CFL032_Elder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Elder',
    deck: 'CFL',
    number: 32,
    players: '1+',
    artUrl: 'assets/classic/CFL/CFL032.png',
    desc: ['When you play this card, place 2 <FOOD> from the general supply on it. After each returning home phase, you may return 1 <FOOD> from this card to use __space:fishing|Fishing__ or take a __Bake Bread__ action without placing a person. You can take the <FOOD> on this card at any time without the additional action.'],
  },
  presentation: { counters: ['food'] },
  impl: {
    listeners: [cardResourceWithdrawal(CARD_ID, 'food')],
    effect: {
      id: CARD_ID,
      onBuy: () => ({ type: 'leaf', actionId: 'store-on-card', sourceCard: CARD_ID, params: { food: 2 } }),
      onAfterReturnHome: (state, player, context) => {
        if (getStoredResource(player, CARD_ID, 'food') < 1) return
        const fishing = state.actionSpaces.find(space => space.id === 'fishing')
        const bake = getActionDefinition('bake-bread')
        const options: ActionFlow[] = []
        const doable = { state, player, sourceCard: CARD_ID, actionHooks: context?.actionHooks, resolveAction: getActionDefinition }
        if (fishing && isActionDoableInFlowContext({
          ...doable, actionId: fishing.id, action: fishing, space: fishing,
          actionSpaceUse: { newPlacement: false },
          actionContext: { viaCardJump: true, targetSpaceId: fishing.id, sourceCard: CARD_ID },
        })) {
          options.push({ ...jumpLeaf({ sourceCard: CARD_ID, targetSpaceId: fishing.id }), optionId: fishing.id, choiceLabelKey: fishing.nameKey })
        }
        if (bake && isActionDoableInFlowContext({
          ...doable, actionId: bake.id, action: bake, space: { ...bake, resources: { ...emptyResources }, takenBy: [] },
        })) {
          options.push({ type: 'leaf', actionId: bake.id, sourceCard: CARD_ID, optionId: bake.id, choiceLabelKey: bake.nameKey })
        }
        if (!options.length) return
        return {
          type: 'xor', optional: true, children: options.map(action => ({
            type: 'seq', choiceLabelKey: action.choiceLabelKey, optionId: action.optionId, children: [
              { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'increment-counter', key: 'food', amount: -1 } },
              action,
            ],
          })),
        }
      },
    },
  },
})
