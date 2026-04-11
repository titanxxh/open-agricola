import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getStoredResource } from '../helpers/card-storage'

const CARD_ID = 'C120_AgriculturalLabourer'

const grainRewardFlow = (
  context: CardListenerContext,
  grainCount: number,
): ActionHookResult | void => {
  if (!context.player.occupationPlayed.includes(CARD_ID)) return
  const availableClay = getStoredResource(context.player, CARD_ID, 'clay')
  const clayToGain = Math.min(availableClay, grainCount)
  if (clayToGain <= 0) return
  return {
    flow: {
      type: 'leaf',
      actionId: 'take-from-card',
      params: { clay: clayToGain },
      sourceCard: CARD_ID,
    },
    sourceCard: CARD_ID,
  }
}

const onPlayListener: CardListenerRegistration = {
  id: 'C120-agricultural-labourer-after-play',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'store-on-card',
        params: { clay: 8 },
        sourceCard: CARD_ID,
      },
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const gainListener: CardListenerRegistration = {
  id: 'C120-agricultural-labourer-after-gain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['gain', 'receive'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const grainCount = context.result?.type === 'ok'
      ? (context.result.resourcesGained?.grain ?? 0)
      : 0
    return grainRewardFlow(context, grainCount)
  },
}

registerCardListener(onPlayListener)
registerCardListener(gainListener)

registerCardEffect({
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const grainFields = _state.harvestReapSummary?.[player.id]?.grainFields
      ?? player.fields.filter((field) => field.crop === 'grain' && field.remaining > 0).length
    if (grainFields <= 0) return
    const availableClay = getStoredResource(player, CARD_ID, 'clay')
    const clayToGain = Math.min(availableClay, grainFields)
    if (clayToGain <= 0) return
    return {
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'take-from-card',
          params: { clay: clayToGain },
          sourceCard: CARD_ID,
        },
      ],
    }
  },
})

export const C120_AgriculturalLabourer = new Occupation({
  id: CARD_ID,
  name: "Agricultural Labourer",
  deck: "C",
  number: 120,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 8 <CLAY> on this card. For each <GRAIN> you obtain, you also get 1 <CLAY> from this card."],
  cost: {},
  players: "1+",
})
