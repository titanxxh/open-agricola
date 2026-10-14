import type {
  ActionDefinition,
  ActionExecutionContext,
  ActionMutationContext,
  ActionExecutionResult,
  PlayerState,
} from '../../contract/types'
import { fieldIsEmpty } from '../../domain/field'
import { positionKey } from '../../domain/farm'
import { playerBoard, type SowSelection } from '../../domain'
import { buildSowFarmInteraction, getAllowedSelectedFieldKeys, permittedSowCrops } from '../../domain/farmyard-interaction'
import { handleSowExtraField } from '../../cards/card-effects'
import { getLogicalFields, mutateLogicalFields } from '../../cards/helpers/card-field'

const sowedAmount = (crop: SowSelection['crop']) => crop === 'grain' || crop === 'wood' ? 3 : 2

export const getEmptyFields = (player: PlayerState) =>
  player.fields.filter(fieldIsEmpty)

export const canSow = (player: PlayerState) =>
  getEmptyFields(player).length > 0 &&
  (player.resources.grain > 0 || player.resources.vegetable > 0)

/** An unconditional Sow keeps the usual field, crop and stack permissions.
 * Seed availability does not change whether the action itself is restricted. */
export const isUnconditionalSow = (
  actionContext?: Record<string, unknown>,
  player?: PlayerState,
): boolean => {
  if (actionContext?.maxSelections !== undefined || actionContext?.maxSeedSelections !== undefined || actionContext?.cropType !== undefined) return false
  if (!player) return actionContext?.allowedFields !== 'fromSelectedFields'
    && !(Array.isArray(actionContext?.excludedFields) && actionContext.excludedFields.length > 0)
  if (getLogicalFields(player).some(field => {
    const usualCrops = field.allowedCrops ?? ['grain', 'vegetable']
    const permitted = permittedSowCrops(usualCrops, actionContext)
    return usualCrops.some(crop => !permitted.includes(crop))
  })) return false
  const permissionPlayer = {
    ...player,
    resources: { ...player.resources, grain: 1, vegetable: 1, wood: 1, stone: 1 },
  }
  const usual = buildSowFarmInteraction(permissionPlayer)
  const constrained = buildSowFarmInteraction(permissionPlayer, actionContext)
  if (usual.farmType !== 'sow' || constrained.farmType !== 'sow') return false
  return usual.selectableFields.every(field => {
    const permitted = constrained.selectableFields.find(candidate => positionKey(candidate.tile) === positionKey(field.tile))
    return permitted !== undefined && field.allowedCrops.every(crop => permitted.allowedCrops.includes(crop))
  })
}

export const sowCrop = (
  player: PlayerState,
  crop: 'grain' | 'vegetable',
): ActionExecutionResult => {
  const emptyField = player.fields.find(fieldIsEmpty)
  if (!emptyField) {
    return { type: 'fail', errorKey: 'log.sowFail' }
  }
  const have = player.resources[crop] ?? 0
  if (have <= 0) {
    return { type: 'fail', errorKey: 'log.sowFail' }
  }
  player.resources[crop] = have - 1
  const remaining = sowedAmount(crop)
  emptyField.stacks.push({ kind: crop, remaining })
  return { type: 'ok' }
}

const applyPlayerMutation = (target: PlayerState, source: PlayerState) => {
  for (const key of Object.keys(target) as Array<keyof PlayerState>) {
    if (!(key in source)) {
      delete (target as Record<string, unknown>)[key as string]
    }
  }
  Object.assign(target, source)
}

export const validateSow = (
  ctx: ActionExecutionContext,
  crops: SowSelection[],
) => {
  const player = ctx.player
  const maxSelections = typeof ctx.actionContext?.maxSelections === 'number'
    ? Math.max(0, Math.floor(ctx.actionContext.maxSelections as number))
    : undefined
  const minSelections = typeof ctx.actionContext?.minSelections === 'number'
    ? Math.max(0, Math.floor(ctx.actionContext.minSelections as number))
    : undefined
  const allowedFieldKeys = getAllowedSelectedFieldKeys(player, ctx.actionContext) ?? undefined
  const excludedFields = Array.isArray(ctx.actionContext?.excludedFields)
    ? (ctx.actionContext.excludedFields as Array<{ row?: unknown; col?: unknown }>).filter(
        (field): field is { row: number; col: number } =>
          typeof field.row === 'number' && typeof field.col === 'number',
      )
    : undefined
  const idx = ctx.state.players.indexOf(player)
  const board = playerBoard(ctx.state, idx)
  const extraFields = board.farmInteraction.permittedExtraSowableFields(ctx.actionContext)
  const extraAllowedCrops = new Map(
    extraFields.map((field) => [positionKey(field.tile), permittedSowCrops(field.allowedCrops, ctx.actionContext)] as const),
  )
  const extraGroupKeys = new Map(
    extraFields
      .filter((field): field is typeof field & { groupKey: string } =>
        field.groupKey !== undefined,
      )
      .map((field) => [positionKey(field.tile), field.groupKey] as const),
  )
  const normalFieldAllowedCrops = permittedSowCrops(['grain', 'vegetable'], ctx.actionContext)
  const validated = board.farmyard.canSow(
    { fields: crops },
    {
      maxSelections,
      maxSeedSelections: typeof ctx.actionContext?.maxSeedSelections === 'number' ? ctx.actionContext.maxSeedSelections : undefined,
      minSelections,
      allowedFieldKeys,
      excludedFields,
      extraAllowedCrops: extraAllowedCrops.size > 0 ? extraAllowedCrops : undefined,
      extraGroupKeys: extraGroupKeys.size > 0 ? extraGroupKeys : undefined,
      normalFieldAllowedCrops,
    },
  )
  return { validated, extraAllowedCrops }
}

const finalizeSow = (
  ctx: ActionMutationContext,
  crops: SowSelection[],
): ActionExecutionResult => {
  const { validated, extraAllowedCrops } = validateSow(ctx, crops)
  if (!validated.ok) {
    return { type: 'fail', errorKey: validated.error?.code ?? 'log.action', recoverable: true }
  }
  const player = ctx.player
  const nextPlayer = JSON.parse(JSON.stringify(validated.player)) as PlayerState
  const logicalTargets = new Map(
    getLogicalFields(nextPlayer).flatMap((field) => field.kind === 'card'
      ? field.slots.map((slot) => [positionKey(slot.tile), { fieldId: field.id, slot: slot.index }] as const)
      : []),
  )
  const mutations = mutateLogicalFields(ctx.state, nextPlayer, { emitEvents: false })
  if (extraAllowedCrops.size > 0) {
    for (const sel of crops) {
      const key = positionKey({ row: sel.row, col: sel.col })
      if (extraAllowedCrops.has(key)) {
        const logicalTarget = logicalTargets.get(key)
        if (logicalTarget) {
          const amount = sowedAmount(sel.crop)
          if (!mutations.place(logicalTarget, sel.crop, amount).ok) {
            return { type: 'fail', errorKey: 'invalid extra sow field', recoverable: true }
          }
          nextPlayer.resources[sel.crop] -= 1
          continue
        }
        const handled = handleSowExtraField(nextPlayer, { row: sel.row, col: sel.col }, sel.crop)
        if (!handled) return { type: 'fail', errorKey: 'invalid extra sow field', recoverable: true }
      }
    }
  }
  applyPlayerMutation(player, nextPlayer)
  ctx.eventSink?.emit<'farm.sown'>({
    type: 'farm.sown',
    sows: crops.map((crop) => ({
      location: { kind: 'field', playerId: player.id, row: crop.row, col: crop.col },
      crop: crop.crop,
      added: sowedAmount(crop.crop),
    })),
  })
  return { type: 'ok' }
}

export const sowAction: ActionDefinition = {
  id: 'sow',
  nameKey: 'actions.sow.name',
  descriptionKey: 'actions.sow.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player, context) => {
    const farm = buildSowFarmInteraction(player, context?.actionContext)
    return farm.farmType === 'sow' && farm.selectableFields.length > 0
  },
  execute: (ctx): ActionExecutionResult => {
    if (Array.isArray(ctx.params?.crops)) {
      return finalizeSow(ctx, ctx.params.crops as SowSelection[])
    }
    const idx = ctx.state.players.indexOf(ctx.player)
    const farm = playerBoard(ctx.state, idx).farmInteraction.selectableTiles('sow', {
      actionContext: ctx.actionContext,
    })
    if (
      ctx.actionContext?.autoResolveSingleSelection === true &&
      farm.farmType === 'sow' &&
      farm.minSelections === 1 &&
      farm.maxSelections === 1 &&
      farm.selectableFields.length === 1 &&
      farm.selectableFields[0]!.allowedCrops.length === 1
    ) {
      const onlyField = farm.selectableFields[0]!
      return finalizeSow(ctx, [{
        row: onlyField.tile.row,
        col: onlyField.tile.col,
        crop: onlyField.allowedCrops[0]!,
      }])
    }
    return {
      type: 'request',
      request: {
        kind: 'farm-select',
        farm,
        options: [
          { value: 'confirm', labelKey: 'ui.interactionSowConfirm' },
        ],
      },
      promptKey: 'ui.interactionSowSelect',
    }
  },
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') {
      return { type: 'fail', errorKey: 'log.action', recoverable: true }
    }
    if (choice === 'confirm' && payload) {
      const crops = (payload as { crops?: SowSelection[] }).crops
      if (!Array.isArray(crops)) return { type: 'fail', errorKey: 'log.action', recoverable: true }
      return finalizeSow(ctx, crops)
    }
    return { type: 'fail', errorKey: 'log.action', recoverable: true }
  },
}
