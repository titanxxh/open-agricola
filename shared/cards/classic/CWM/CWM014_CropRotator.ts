import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getLogicalFields } from '../../helpers/card-field'
import type { ReapReceipt } from '../../../actions/helpers/reap-listener'

const CARD_ID = 'CWM014_CropRotator'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf',
      actionId: 'reap',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: { trigger: { phase: 'private-field-phase', cardId: CARD_ID } },
    }),
  },
  listeners: [
    {
      id: CARD_ID + '-rotate',
      cardIds: [CARD_ID],
      actions: ['reap'],
      phases: ['after'],
      handler: (context) => {
        const receipt = (
          context.result && 'extraData' in context.result
            ? context.result.extraData
            : context.extraData
        ) as ReapReceipt | undefined
        const children = getLogicalFields(context.player).flatMap((field) => {
          const prior = receipt?.emptiedFieldCrops?.[field.id]
          if (
            field.kind !== 'farmyard' ||
            (prior !== 'grain' && prior !== 'vegetable') ||
            field.stacks.length
          )
            return []
          const crop = prior === 'grain' ? 'vegetable' : 'grain'
          if (context.player.resources[crop] < 1) return []
          return [
            {
              type: 'leaf' as const,
              actionId: 'sow',
              sourceCard: CARD_ID,
              optional: true,
              actionContext: {
                cropType: crop,
                maxSelections: 1,
                excludedFields: getLogicalFields(context.player)
                  .filter((f) => f.id !== field.id)
                  .map((f) => ({ row: f.row, col: f.col })),
              },
            },
          ]
        })
        return children.length
          ? { sourceCard: CARD_ID, flow: { type: 'seq', children } }
          : undefined
      },
    },
  ],
} satisfies CardImpl

export const CWM014_CropRotator = defineOccupationCard({
  meta: {
    id: 'CWM014_CropRotator',
    name: "Crop Rotator",
    deck: 'CWM',
    number: 14,
    desc: ["Whenever you harvest the last grain or vegetable from a farmyard field, you may immediately sow the opposite crop in that field. When you play this card, you may harvest all your farmyard fields once. An emptied field can trigger this effect only if you can sow the other crop."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM014.png',
  },
  impl: cardImpl,
})

export const CWM014_CropRotator_impl = CWM014_CropRotator.impl
