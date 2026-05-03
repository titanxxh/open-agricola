import type {
  ActionDefinition,
  ActionExecutionContext,
  ActionExecutionResult,
  PlayerState,
} from '../../game/types'
import { fieldIsEmpty } from '../../game/field'
import { applyFarmChoice, type FarmChoicePayloadMap } from '../../logic/farm/farm-choice'
import { positionKey } from '../../game/farm'
import { getPermittedExtraSowableFields } from '../../logic/farm/farm-interaction'
import { handleSowExtraField } from '../../cards/card-effects'
import type { SowSelection } from '../../logic/farm/sow-validation'

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
    return { type: 'fail', logKey: 'log.sowFail' }
  }
  const have = player.resources[crop] ?? 0
  if (have <= 0) {
    return { type: 'fail', logKey: 'log.sowFail' }
  }
  player.resources[crop] = have - 1
  const remaining = crop === 'grain' ? 3 : 2
  emptyField.stacks.push({ kind: crop, remaining })
  return { type: 'ok', logKey: 'log.sow' }
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
  ctx: ActionExecutionContext,
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
  const extraFields = getPermittedExtraSowableFields(player, ctx.actionContext)
  const extraAllowedCrops = new Map(
    extraFields.map((field) => [positionKey(field.tile), field.allowedCrops] as const),
  )
  const result = applyFarmChoice(player, 'sow', { crops } as FarmChoicePayloadMap['sow'], {
    sowOptions: {
      maxSelections,
      excludedFields,
      extraAllowedCrops: extraAllowedCrops.size > 0 ? extraAllowedCrops : undefined,
    },
  })
  if (!result.ok) return { type: 'fail', logKey: result.error ?? 'log.action' }
  const nextPlayer = result.player as unknown as PlayerState
  if (extraAllowedCrops.size > 0) {
    for (const sel of crops) {
      const key = positionKey({ row: sel.row, col: sel.col })
      if (extraAllowedCrops.has(key)) {
        const handled = handleSowExtraField(nextPlayer, { row: sel.row, col: sel.col }, sel.crop)
        if (!handled) return { type: 'fail', logKey: 'invalid extra sow field' }
      }
    }
  }
  applyPlayerMutation(player, nextPlayer)
  return { type: 'ok' }
}

export const sowAction: ActionDefinition = {
  id: 'sow',
  nameKey: 'actions.sow.name',
  descriptionKey: 'actions.sow.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_, player) => canSow(player),
  execute: () => ({
    type: 'choice',
    promptKey: 'ui.interactionSowSelect',
    options: [
      { value: 'confirm', labelKey: 'ui.interactionSowConfirm' },
      { value: 'cancel', labelKey: 'ui.interactionSowCancel' },
    ],
  }),
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') return { type: 'ok' }

    // First call: client submitted crops alongside `confirm`.
    if (choice === 'confirm' && payload) {
      const crops = (payload as { crops?: SowSelection[] }).crops
      if (!Array.isArray(crops)) return { type: 'fail', logKey: 'log.action' }
      return finalizeSow(ctx, crops)
    }

    // Legacy compatibility (PR 3 transition): commitFarmChoice('sow', ...)
    // mutates state itself, then drives the engine with a bare 'confirm' (no
    // payload). Treat any non-confirm/cancel choice as a no-op so after-hooks
    // still fire. Mirrors the original `() => ({ type: 'ok' })` behavior.
    // Removed in Task 3 once commitFarmChoice's sow branch is gone.
    return { type: 'ok' }
  },
}
