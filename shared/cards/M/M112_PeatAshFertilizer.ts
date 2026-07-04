import { defineMinorCard } from '../card-source'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import { getFarmyardSpaceStates } from '../../domain/farmyard-space-states'
import type { CardImpl } from '../registry'

const CARD_ID = 'M112_PeatAshFertilizer'

const hasGrowableCrops = (context: CardListenerContext) =>
  context.player.fields.some((field) =>
    field.stacks.some((stack) =>
      (stack.kind === 'grain' || stack.kind === 'vegetable') && stack.remaining > 0,
    ),
  ) ||
  getFarmyardSpaceStates(context.player).some((state) =>
    state.kind === 'non-field-crop-space' &&
    !!state.crop &&
    (state.crop.kind === 'grain' || state.crop.kind === 'vegetable') &&
    state.crop.remaining > 0,
  )

const listener: CardListenerRegistration = {
  id: 'M112-peat-ash-fertilizer-before-cut-peat',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['cut-peat'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!hasGrowableCrops(context)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        optional: true,
        params: { kind: 'grow-field-and-non-field-crops' },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M112_PeatAshFertilizer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Ash Fertilizer",
    deck: "M",
    number: 112,
    category: "CROP_PROVIDER",
    desc: [
        "Each time before you take the __Cut Peat__ special action, you can place 1 additional crop of the same type on all <FIELD> and farmyard spaces containing <GRAIN> or <VEGETABLE>. Do not place any crops on empty <FIELD> and farmyard spaces."
    ],
    cost: {
        "vegetable": 1
    },
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M112_PeatAshFertilizer_impl = M112_PeatAshFertilizer.impl
