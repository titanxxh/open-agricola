import type { DraftGameEvent, FarmCropRemovedEvent } from '../../../contract/events'
import type { FarmTilePosition } from '../../../contract/types'
import { permittedSowCrops } from '../../../domain/farmyard-interaction'
import type { CardListenerContext } from '../../card-listeners'
import { defineOccupationCard } from '../../card-source'
import { getLogicalFields, type LogicalField } from '../../helpers/card-field'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM014_CropRotator'

type QueryableCropRemovedEvent = FarmCropRemovedEvent | DraftGameEvent<'farm.cropRemoved'>

const isCropRemovedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableCropRemovedEvent =>
  event.type === 'farm.cropRemoved'

const currentReapCropEvents = (context: CardListenerContext): QueryableCropRemovedEvent[] => {
  const fromAction = (context.actionEvents ?? []).filter(
    (event): event is QueryableCropRemovedEvent =>
      isCropRemovedEvent(event) && event.reason === 'reap',
  )
  if (fromAction.length > 0) return fromAction
  const triggerPhase = (context.extraData?.trigger as { phase?: unknown } | undefined)?.phase
  if (triggerPhase !== 'harvest') return []
  return (context.state.events ?? []).filter(
    (event): event is FarmCropRemovedEvent =>
      event.type === 'farm.cropRemoved'
      && event.reason === 'reap'
      && event.round === context.state.round
      && event.actorPlayerId === context.player.id
      && event.trigger?.phase === 'harvest',
  )
}

const findFieldForLocation = (
  fields: readonly LogicalField[],
  location: { kind: string; row?: number; col?: number; cardId?: string },
): LogicalField | undefined => {
  if (location.kind === 'field') {
    return fields.find(
      (field) => field.kind === 'farmyard' && field.row === location.row && field.col === location.col,
    )
  }
  if (location.kind === 'card' && location.cardId) {
    return fields.find((field) => field.kind === 'card' && field.sourceCard === location.cardId)
  }
  return undefined
}

const buildExcludedFields = (
  fields: readonly LogicalField[],
  targetFieldId: string,
): FarmTilePosition[] =>
  fields.flatMap((field) => {
    if (field.id === targetFieldId) return []
    const positions: FarmTilePosition[] = [{ row: field.row, col: field.col }]
    for (const slot of field.slots) {
      positions.push({ row: slot.tile.row, col: slot.tile.col })
    }
    return positions
  })

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const hasCrops = getLogicalFields(player).some((field) =>
        field.stacks.some(
          (stack) => (stack.kind === 'grain' || stack.kind === 'vegetable') && stack.remaining > 0,
        ),
      )
      if (!hasCrops) return
      return {
        type: 'leaf',
        actionId: 'reap',
        sourceCard: CARD_ID,
        actionContext: { trigger: { phase: 'private-field-phase', cardId: CARD_ID } },
      }
    },
  },
  listeners: [
    {
      id: `${CARD_ID}-rotate`,
      cardIds: [CARD_ID],
      actions: ['reap'],
      phases: ['after'],
      handler: (context) => {
        const fields = getLogicalFields(context.player)
        const priorCropByFieldId = new Map<string, 'grain' | 'vegetable'>()
        for (const event of currentReapCropEvents(context)) {
          for (const entry of event.crops) {
            if (entry.crop !== 'grain' && entry.crop !== 'vegetable') continue
            const field = findFieldForLocation(fields, entry.location)
            if (field && field.stacks.length === 0) {
              priorCropByFieldId.set(field.id, entry.crop)
            }
          }
        }
        const children = fields.flatMap((field) => {
          const priorCrop = priorCropByFieldId.get(field.id)
          if (!priorCrop || field.stacks.length > 0) return []
          const oppositeCrop = priorCrop === 'grain' ? 'vegetable' : 'grain'
          if ((context.player.resources[oppositeCrop] ?? 0) < 1) return []
          const usualCrops = field.allowedCrops ?? ['grain', 'vegetable']
          if (!permittedSowCrops(usualCrops, { cropType: oppositeCrop }).includes(oppositeCrop)) {
            return []
          }
          return [
            {
              type: 'leaf' as const,
              actionId: 'sow',
              sourceCard: CARD_ID,
              optional: true,
              actionContext: {
                cropType: oppositeCrop,
                minSelections: 1,
                maxSelections: 1,
                excludedFields: buildExcludedFields(fields, field.id),
              },
            },
          ]
        })
        if (children.length === 0) return
        return {
          sourceCard: CARD_ID,
          flow: children.length === 1 ? children[0]! : { type: 'seq', children },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM014_CropRotator = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Crop Rotator',
    deck: 'CWM',
    number: 14,
    players: '1+',
    cost: {},
    vp: 0,
    desc: [
      'Whenever you remove the last <GRAIN>/<VEGETABLE> from a <FIELD>, you may immediately __Sow__ a <VEGETABLE>/<GRAIN> in that <FIELD>. When you play this card, immediately take 1 <GRAIN> or <VEGETABLE> from each of your <FIELD> and place them in your supply.',
    ],
    artUrl: 'assets/classic/CWM/CWM014.png',
    implemented: true,
  },
  impl: cardImpl,
})

export const CWM014_CropRotator_impl = CWM014_CropRotator.impl
