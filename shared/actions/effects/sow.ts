import type {
  ActionDefinition,
  ActionMutationContext,
  ActionExecutionResult,
  PlayerState,
} from '../../contract/types'
import { fieldIsEmpty } from '../../domain/field'
import { positionKey } from '../../domain/farm'
import { playerBoard, type SowSelection } from '../../domain'
import { buildSowFarmInteraction } from '../../domain/farmyard'
import { handleSowExtraField } from '../../cards/card-effects'

export const getEmptyFields = (player: PlayerState) =>
  player.fields.filter(fieldIsEmpty)

export const canSow = (player: PlayerState) =>
  getEmptyFields(player).length > 0 &&
  (player.resources.grain > 0 || player.resources.vegetable > 0)

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
  const remaining = crop === 'grain' ? 3 : 2
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

const finalizeSow = (
  ctx: ActionMutationContext,
  crops: SowSelection[],
): ActionExecutionResult => {
  const player = ctx.player
  const maxSelections = typeof ctx.actionContext?.maxSelections === 'number'
    ? Math.max(0, Math.floor(ctx.actionContext.maxSelections as number))
    : undefined
  const excludedFields = Array.isArray(ctx.actionContext?.excludedFields)
    ? (ctx.actionContext.excludedFields as Array<{ row?: unknown; col?: unknown }>).filter(
        (field): field is { row: number; col: number } =>
          typeof field.row === 'number' && typeof field.col === 'number',
      )
    : undefined
  const idx = ctx.state.players.indexOf(player)
  const board = playerBoard(ctx.state, idx)
  const extraFields = board.farmyard.permittedExtraSowableFields(ctx.actionContext)
  const extraAllowedCrops = new Map(
    extraFields.map((field) => [positionKey(field.tile), field.allowedCrops] as const),
  )
  const extraGroupKeys = new Map(
    extraFields
      .filter((field): field is typeof field & { groupKey: string } =>
        field.groupKey !== undefined,
      )
      .map((field) => [positionKey(field.tile), field.groupKey] as const),
  )
  // §2.5 P0 修正: normal field 物理只支持 grain/vegetable stack. 当 cropType
  // ∈ {wood,stone} 时 normal field 必须拒绝 (否则 validateSow 通过但
  // updatedFields 不 push stack 也不扣资源, silent gap).
  const ctxCropType =
    typeof ctx.actionContext?.cropType === 'string'
      ? (ctx.actionContext.cropType as SowSelection['crop'])
      : undefined
  const normalFieldAllowedCrops: SowSelection['crop'][] | undefined =
    ctxCropType === 'grain' || ctxCropType === 'vegetable'
      ? [ctxCropType]
      : ctxCropType === 'wood' || ctxCropType === 'stone'
        ? []
        : undefined
  const validated = board.farmyard.canSow(
    { fields: crops },
    {
      maxSelections,
      excludedFields,
      extraAllowedCrops: extraAllowedCrops.size > 0 ? extraAllowedCrops : undefined,
      extraGroupKeys: extraGroupKeys.size > 0 ? extraGroupKeys : undefined,
      normalFieldAllowedCrops,
    },
  )
  if (!validated.ok) {
    return { type: 'fail', errorKey: validated.error?.code ?? 'log.action' }
  }
  const nextPlayer = JSON.parse(JSON.stringify(validated.player)) as PlayerState
  if (extraAllowedCrops.size > 0) {
    for (const sel of crops) {
      const key = positionKey({ row: sel.row, col: sel.col })
      if (extraAllowedCrops.has(key)) {
        const handled = handleSowExtraField(nextPlayer, { row: sel.row, col: sel.col }, sel.crop)
        if (!handled) return { type: 'fail', errorKey: 'invalid extra sow field' }
      }
    }
  }
  applyPlayerMutation(player, nextPlayer)
  ctx.eventSink?.emit<'farm.sown'>({
    type: 'farm.sown',
    sows: crops.map((crop) => ({
      location: { kind: 'field', playerId: player.id, row: crop.row, col: crop.col },
      crop: crop.crop,
      added: crop.crop === 'grain' ? 3 : crop.crop === 'vegetable' ? 2 : 1,
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
  execute: ({ state, player, actionContext }): ActionExecutionResult => {
    const idx = state.players.indexOf(player)
    const farm = playerBoard(state, idx).farmyard.selectableTiles('sow', { actionContext })
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
      if (!Array.isArray(crops)) return { type: 'fail', errorKey: 'log.action' }
      return finalizeSow(ctx, crops)
    }
    return { type: 'fail', errorKey: 'log.action' }
  },
}
