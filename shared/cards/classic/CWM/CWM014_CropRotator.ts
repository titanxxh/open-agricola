import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import type { DraftGameEvent, FarmCropRemovedEvent, ResourceLocation } from '../../../contract/events'
import type { ActionFlow, FarmTilePosition, Resource } from '../../../contract/types'
import { permittedSowCrops } from '../../../domain/farmyard-interaction'
import { addResourcesFromCards } from '../../../session/stats'
import type { CardListenerContext } from '../../card-listeners'
import { defineOccupationCard } from '../../card-source'
import { addCardResourceGained } from '../../helpers/card-state'
import { getLogicalFields, mutateLogicalFields, type LogicalField } from '../../helpers/card-field'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM014_CropRotator'
const TAKE_CROPS_ACTION_ID = 'card_CWM014_CropRotator_take-crops'

type RotatableCrop = 'grain' | 'vegetable'
type QueryableCropRemovedEvent = FarmCropRemovedEvent | DraftGameEvent<'farm.cropRemoved'>

const isRotatableCrop = (crop: unknown): crop is RotatableCrop =>
  crop === 'grain' || crop === 'vegetable'

const isCropRemovedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableCropRemovedEvent =>
  event.type === 'farm.cropRemoved'

registerAdHocAction({
  id: TAKE_CROPS_ACTION_ID,
  nameKey: 'actions.reap.name',
  descriptionKey: 'actions.reap.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, eventSink }) => {
    const targets: Array<{ field: LogicalField; slot?: number; crop: RotatableCrop }> =
      getLogicalFields(player).flatMap((field) => {
        if (field.kind === 'farmyard') {
          const top = field.stacks.at(-1)
          if (!top || top.remaining <= 0 || !isRotatableCrop(top.kind)) return []
          return [{ field, crop: top.kind }]
        }
        const occupiedSlot = [...field.slots].reverse().find(
          (slot) => slot.stack && slot.stack.remaining > 0 && isRotatableCrop(slot.stack.kind),
        )
        if (!occupiedSlot?.stack || !isRotatableCrop(occupiedSlot.stack.kind)) return []
        return [{ field, slot: occupiedSlot.index, crop: occupiedSlot.stack.kind }]
      })
    if (targets.length === 0) return { type: 'ok' }

    const mutator = mutateLogicalFields(state, player, {
      sourceCard: CARD_ID,
      reason: 'cardEffect',
      emitEvents: false,
      deferOwnerCallbacks: true,
    })
    const removedCrops: Array<{ location: ResourceLocation; crop: RotatableCrop; amount: number }> = []
    const gainedTotals: Partial<Resource> = {}
    const ownerFlows: ActionFlow[] = []

    for (const entry of targets) {
      const result = mutator.remove(
        entry.field.kind === 'card'
          ? { fieldId: entry.field.id, slot: entry.slot }
          : { fieldId: entry.field.id },
        1,
      )
      if (!result.ok) continue
      const location: ResourceLocation =
        entry.field.kind === 'card'
          ? { kind: 'card', playerId: player.id, cardId: entry.field.sourceCard! }
          : { kind: 'field', playerId: player.id, row: entry.field.row, col: entry.field.col }
      player.resources[entry.crop] = (player.resources[entry.crop] ?? 0) + 1
      gainedTotals[entry.crop] = (gainedTotals[entry.crop] ?? 0) + 1
      removedCrops.push({ location, crop: entry.crop, amount: 1 })
      eventSink?.emit<'resource.moved'>({
        type: 'resource.moved',
        resources: { [entry.crop]: 1 },
        from: location,
        to: { kind: 'player', playerId: player.id },
        reason: 'cardEffect',
        sourceCardId: CARD_ID,
      })
      const callbackFlow = result.ownerCallback?.()
      if (callbackFlow) ownerFlows.push(callbackFlow)
    }

    if (Object.keys(gainedTotals).length > 0) {
      addResourcesFromCards(player, gainedTotals)
      addCardResourceGained(player, CARD_ID, gainedTotals)
    }
    if (removedCrops.length > 0) {
      eventSink?.emit<'farm.cropRemoved'>({
        type: 'farm.cropRemoved',
        sourceCardId: CARD_ID,
        crops: removedCrops,
        reason: 'cardEffect',
      })
    }
    if (ownerFlows.length === 0) return { type: 'ok', resourcesGained: gainedTotals }
    return {
      type: 'flow',
      flow: ownerFlows.length === 1 ? ownerFlows[0]! : { type: 'parallel', children: ownerFlows },
    }
  },
})

const findFieldForLocation = (
  fields: readonly LogicalField[],
  location: { kind: string; playerId?: string; row?: number; col?: number; cardId?: string },
  playerId: string,
): LogicalField | undefined => {
  if (location.playerId !== playerId) return undefined
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

const buildRotationResult = (
  context: CardListenerContext,
  events: readonly QueryableCropRemovedEvent[],
) => {
  if (events.length === 0) return undefined
  const fields = getLogicalFields(context.player)
  const priorCropByFieldId = new Map<string, RotatableCrop>()
  for (const event of events) {
    for (const entry of event.crops) {
      if (!isRotatableCrop(entry.crop)) continue
      const field = findFieldForLocation(fields, entry.location, context.player.id)
      if (!field) continue
      const stillHasRemovedCrop = field.stacks.some(
        (stack) => stack.kind === entry.crop && stack.remaining > 0,
      )
      const hasOpenSowSlot =
        field.kind === 'farmyard'
          ? field.stacks.length === 0
          : field.slots.some((slot) => !slot.stack)
      if (!stillHasRemovedCrop && hasOpenSowSlot) {
        priorCropByFieldId.set(field.id, entry.crop)
      }
    }
  }
  const children = fields.flatMap((field) => {
    const priorCrop = priorCropByFieldId.get(field.id)
    if (!priorCrop) return []
    const hasOpenSowSlot =
      field.kind === 'farmyard'
        ? field.stacks.length === 0
        : field.slots.some((slot) => !slot.stack)
    if (!hasOpenSowSlot) return []
    const oppositeCrop: RotatableCrop = priorCrop === 'grain' ? 'vegetable' : 'grain'
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
  if (children.length === 0) return undefined
  return {
    sourceCard: CARD_ID,
    flow: children.length === 1 ? children[0]! : { type: 'seq' as const, children },
  }
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const hasRotatableTopCrop = getLogicalFields(player).some((field) =>
        field.kind === 'farmyard'
          ? Boolean(field.stacks.at(-1) && field.stacks.at(-1)!.remaining > 0 && isRotatableCrop(field.stacks.at(-1)!.kind))
          : field.slots.some((slot) => Boolean(slot.stack && slot.stack.remaining > 0 && isRotatableCrop(slot.stack.kind))),
      )
      if (!hasRotatableTopCrop) return
      return {
        type: 'leaf',
        actionId: TAKE_CROPS_ACTION_ID,
        sourceCard: CARD_ID,
      }
    },
  },
  listeners: [
    {
      id: `${CARD_ID}-rotate`,
      cardIds: [CARD_ID],
      events: ['farm.cropRemoved'],
      phases: ['after'],
      handler: (context) =>
        buildRotationResult(
          context,
          (context.actionEvents ?? []).filter(isCropRemovedEvent),
        ),
    },
    {
      id: `${CARD_ID}-rotate-harvest`,
      cardIds: [CARD_ID],
      actions: ['reap'],
      phases: ['after'],
      handler: (context) => {
        if ((context.actionEvents ?? []).some(isCropRemovedEvent)) return
        const triggerPhase = (context.extraData?.trigger as { phase?: unknown } | undefined)?.phase
        if (triggerPhase !== 'harvest') return
        const harvestEvents = (context.state.events ?? []).filter(
          (event): event is FarmCropRemovedEvent =>
            event.type === 'farm.cropRemoved'
            && event.reason === 'reap'
            && event.round === context.state.round
            && event.actorPlayerId === context.player.id
            && event.trigger?.phase === 'harvest',
        )
        return buildRotationResult(context, harvestEvents)
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
