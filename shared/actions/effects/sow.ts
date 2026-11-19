import { commitFarmOperation } from '../../domain/farm-operations'
import type {
  ActionDefinition,
  ActionExecutionContext,
  ActionMutationContext,
  ActionExecutionResult,
  FarmPositionSelectionTarget,
  PlayerState,
} from '../../contract/types'
import { fieldIsEmpty } from '../../domain/field'
import { positionKey } from '../../domain/farm'
import { playerBoard, type SowSelection } from '../../domain'
import { buildFarmPositionSelectionInteraction, buildSowFarmInteraction, getAllowedSelectedFieldKeys, permittedSowCrops } from '../../domain/farmyard-interaction'
import { handleSowExtraField } from '../../cards/card-effects'
import { getLogicalFields, mutateLogicalFields } from '../../cards/helpers/card-field'
import type { SowTarget } from '../../cards/card-effects'
import { BASE_SOW_AMOUNT } from '../../domain/sow-amount'
import { validateFarmPositionSelection, buildFarmPositionSelectionRequest } from '../../domain/farm-position-selection'
import {
  finalSowAmount,
  optionalSowAmountSources,
  planSowAmounts,
  type SowAmountPlan,
} from '../helpers/sow-amount'

/** Sow selections and optional bonus choices carried between the Sow prompts. */
const SOW_PAYLOAD_KEY = 'sowPayload'
type SowPayload = {
  crops: SowSelection[]
  chosen: Record<string, string[]>
  /** Optional bonus source the current prompt asks about, with its targets. */
  pendingSource?: string
  selectableTiles?: FarmPositionSelectionTarget[]
  /** The Sow's own values of the keys the bonus prompt borrows. */
  originalContext?: Record<string, unknown>
}

/** Session selection commits read these keys from the pending actionContext. */
const BONUS_PROMPT_KEYS = ['selectionKind', 'selectableTiles', 'minSelections', 'maxSelections'] as const

const pickBonusPromptKeys = (actionContext?: Record<string, unknown>) =>
  Object.fromEntries(BONUS_PROMPT_KEYS.flatMap((key) =>
    actionContext && Object.hasOwn(actionContext, key) ? [[key, actionContext[key]]] : []))

/** The Sow's own actionContext, without what its bonus prompts wrote. */
const sowActionContext = (actionContext: Record<string, unknown> | undefined, payload: SowPayload | undefined) => {
  if (!payload) return actionContext
  const own = { ...(actionContext ?? {}) }
  for (const key of [...BONUS_PROMPT_KEYS, SOW_PAYLOAD_KEY]) delete own[key]
  return { ...own, ...(payload.originalContext ?? {}) }
}

/** Patch that removes the bonus prompt keys again once the Sow is placed. */
const restoreSowActionContext = (payload: SowPayload | undefined) => payload
  ? {
      [SOW_PAYLOAD_KEY]: undefined,
      ...Object.fromEntries(BONUS_PROMPT_KEYS.map((key) => [key, payload.originalContext?.[key]])),
    }
  : undefined

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
  if (actionContext?.maxSelections !== undefined || actionContext?.maxSeedSelections !== undefined || actionContext?.cropType !== undefined
    || actionContext?.allowedFields === 'fromSelectedFields') return false
  const ordinaryCrops = permittedSowCrops(['grain', 'vegetable'], actionContext)
  if (!ordinaryCrops.includes('grain') || !ordinaryCrops.includes('vegetable')) return false
  if (!player) return !(Array.isArray(actionContext?.excludedFields) && actionContext.excludedFields.length > 0)
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
  const remaining = BASE_SOW_AMOUNT[crop]
  emptyField.stacks.push({ kind: crop, remaining })
  return { type: 'ok' }
}

export const validateSow = (
  ctx: ActionExecutionContext,
  crops: SowSelection[],
  sowAmounts?: ReadonlyMap<string, number>,
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
      sowAmounts,
    },
  )
  const extraSourceCards = new Map(extraFields.map((field) => [positionKey(field.tile), field.sourceCard] as const))
  return { validated, extraAllowedCrops, extraSourceCards }
}

const sowTargets = (
  player: PlayerState,
  crops: readonly SowSelection[],
  extraSourceCards: ReadonlyMap<string, string>,
) => {
  const cardSlots = new Map(
    getLogicalFields(player).flatMap((field) => field.kind === 'card' && field.sourceCard
      ? field.slots.map((slot) => [positionKey(slot.tile), { cardId: field.sourceCard!, slot: slot.index, groupKey: field.groupKey }] as const)
      : []),
  )
  return crops.map((sel) => {
    const key = positionKey({ row: sel.row, col: sel.col })
    const cardSlot = cardSlots.get(key)
    const extraCard = extraSourceCards.get(key)
    const target: SowTarget = cardSlot
      ? { kind: 'card-field', row: sel.row, col: sel.col, cardId: cardSlot.cardId, slot: cardSlot.slot }
      : extraCard
        ? { kind: 'extra', row: sel.row, col: sel.col, cardId: extraCard }
        : { kind: 'farmyard', row: sel.row, col: sel.col }
    // Card Field targets keep their card metadata so the board can render them as selectable.
    const selectionTile = cardSlot
      ? { row: sel.row, col: sel.col, sourceCard: cardSlot.cardId, groupKey: cardSlot.groupKey, cardFieldSlot: cardSlot.slot }
      : { row: sel.row, col: sel.col }
    return { key, target, crop: sel.crop, selectionTile }
  })
}

const readSowPayload = (actionContext?: Record<string, unknown>): SowPayload | undefined => {
  const payload = actionContext?.[SOW_PAYLOAD_KEY] as Partial<SowPayload> | undefined
  if (!payload || !Array.isArray(payload.crops) || typeof payload.chosen !== 'object' || payload.chosen === null) return undefined
  return payload as SowPayload
}

/** Plans the final amounts; asks for the next optional bonus source, or places everything. */
const continueSow = (
  outerCtx: ActionMutationContext,
  crops: SowSelection[],
  chosen: Record<string, string[]>,
  previous?: SowPayload,
): ActionExecutionResult => {
  const ctx = previous ? { ...outerCtx, actionContext: sowActionContext(outerCtx.actionContext, previous) } : outerCtx
  const { validated, extraSourceCards } = validateSow(ctx, crops)
  if (!validated.ok) {
    return { type: 'fail', errorKey: validated.error?.code ?? 'log.action', recoverable: true }
  }
  const targets = sowTargets(ctx.player, crops, extraSourceCards)
  const plans = planSowAmounts({
    state: ctx.state,
    player: ctx.player,
    targets,
    sourceCard: ctx.sourceCard,
    actionContext: ctx.actionContext,
  })
  const next = optionalSowAmountSources(plans).find(({ cardId }) => !Object.hasOwn(chosen, cardId))
  if (!next) return finalizeSow(ctx, crops, plans, chosen, previous)
  const selectionContext = {
    selectableTiles: next.keys.map((key) => targets.find((target) => target.key === key)!.selectionTile),
    minSelections: 0,
    maxSelections: next.keys.length,
  }
  return {
    type: 'request',
    request: {
      kind: 'selection',
      selection: buildFarmPositionSelectionInteraction(ctx.player, selectionContext),
      options: [{ value: 'confirm', labelKey: 'ui.interactionSelectionConfirm' }],
    },
    promptKey: 'ui.interactionSelection',
    // The Sow keeps its own source card; the prompt only names the bonus card.
    promptParams: { minSelections: 0, maxSelections: next.keys.length, triggerCardId: next.cardId },
    extraData: {
      actionContextWrite: {
        ...selectionContext,
        selectionKind: 'farm-position',
        [SOW_PAYLOAD_KEY]: {
          crops,
          chosen,
          pendingSource: next.cardId,
          selectableTiles: selectionContext.selectableTiles,
          originalContext: previous?.originalContext ?? pickBonusPromptKeys(outerCtx.actionContext),
        } satisfies SowPayload,
      },
    },
  }
}

const resolveSowBonus = (
  ctx: ActionMutationContext,
  payload: SowPayload,
  positions: unknown,
): ActionExecutionResult => {
  const source = payload.pendingSource
  if (typeof source !== 'string' || !Array.isArray(positions)) {
    return { type: 'fail', errorKey: 'log.action', recoverable: true }
  }
  const request = buildFarmPositionSelectionRequest(ctx.player, {
    selectableTiles: payload.selectableTiles,
    minSelections: 0,
    maxSelections: Array.isArray(payload.selectableTiles) ? payload.selectableTiles.length : 0,
  })
  const validation = validateFarmPositionSelection({ request, positions: positions as string[] })
  if (!validation.ok) return { type: 'fail', errorKey: validation.error, recoverable: true }
  return continueSow(ctx, payload.crops, { ...payload.chosen, [source]: validation.positionStrings }, payload)
}

const finalizeSow = (
  ctx: ActionMutationContext,
  crops: SowSelection[],
  plans: readonly SowAmountPlan[],
  chosen: Readonly<Record<string, readonly string[]>>,
  previous?: SowPayload,
): ActionExecutionResult => {
  const amounts = new Map(plans.map((plan) => [plan.key, finalSowAmount(plan, chosen)] as const))
  const { validated, extraAllowedCrops } = validateSow(ctx, crops, amounts)
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
        const amount = amounts.get(key) ?? BASE_SOW_AMOUNT[sel.crop]
        const logicalTarget = logicalTargets.get(key)
        if (logicalTarget) {
          if (!mutations.place(logicalTarget, sel.crop, amount).ok) {
            return { type: 'fail', errorKey: 'invalid extra sow field', recoverable: true }
          }
          nextPlayer.resources[sel.crop] -= 1
          continue
        }
        const handled = handleSowExtraField(nextPlayer, { row: sel.row, col: sel.col }, sel.crop, amount)
        if (!handled) return { type: 'fail', errorKey: 'invalid extra sow field', recoverable: true }
      }
    }
  }
  const farmOperation = commitFarmOperation(player, { kind: 'crops', positions: crops, preparedPlayer: nextPlayer, sourceCardId: ctx.sourceCard }, ctx.eventSink)
  ctx.eventSink?.emit<'farm.sown'>({
    type: 'farm.sown',
    sows: crops.map((crop) => ({
      location: { kind: 'field', playerId: player.id, row: crop.row, col: crop.col },
      crop: crop.crop,
      added: amounts.get(positionKey({ row: crop.row, col: crop.col })) ?? BASE_SOW_AMOUNT[crop.crop],
    })),
  })
  const actionContextWrite = restoreSowActionContext(previous)
  return { type: 'ok', farmOperations: [farmOperation], ...(actionContextWrite ? { extraData: { actionContextWrite } } : {}) }
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
      return continueSow(ctx, ctx.params.crops as SowSelection[], {})
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
      return continueSow(ctx, [{
        row: onlyField.tile.row,
        col: onlyField.tile.col,
        crop: onlyField.allowedCrops[0]!,
      }], {})
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
      // While a bonus prompt is open, only its positions are accepted.
      const pending = readSowPayload(ctx.actionContext)
      if (pending) return resolveSowBonus(ctx, pending, (payload as { positions?: unknown }).positions)
      const crops = (payload as { crops?: SowSelection[] }).crops
      if (!Array.isArray(crops)) return { type: 'fail', errorKey: 'log.action', recoverable: true }
      return continueSow(ctx, crops, {})
    }
    return { type: 'fail', errorKey: 'log.action', recoverable: true }
  },
}
