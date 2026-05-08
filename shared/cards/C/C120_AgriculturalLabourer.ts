import { Occupation } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getStoredResource } from '../helpers/card-storage'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'C120_AgriculturalLabourer'

const grainRewardFlow = (
  context: CardListenerContext,
  grainCount: number,
): ActionHookResult | void => {
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

export const C120_AgriculturalLabourer_impl = {
  listeners: [onPlayListener, gainListener],
  effect: {
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    const grainFields = _state.harvestReapSummary?.[player.id]?.grainFields
      ?? player.fields.filter((field) => fieldHasCrop(field, 'grain')).length
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
