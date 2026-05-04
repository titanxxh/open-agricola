import type {
  ActionDefinition,
  ActionExecutionContext,
  ActionExecutionResult,
  ActionSpace,
  FenceSegment,
  GameState,
  PlayerState,
  Resource,
} from '../../game/types'
// PaymentSolver namespace (S3 Task 7b): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
// fencing.ts only uses typed-flat helpers (shim scope), so no PaymentSolver
// call sites exist here yet.
import {
  canAffordTypedFlatCost,
  executeResolvedTypedFlatPayment,
  resolveTypedFlatPaymentSelection,
} from '../payment/internal'
import {
  normalizePlayerFarm,
  validateFenceSelection,
} from '../../logic/farm/fence-validation'
import { collectLockedFarmTileKeys } from '../../cards/card-effects'
import { collectComputeCostsForFarmChoice } from '../../cards/card-listeners'
import { playerCanBuildPalisades } from '../../cards/helpers/card-type'
import {
  consumePendingFenceBonus,
  readPendingFenceBonus,
} from '../../cards/helpers/pending-fence-bonus'

export const maxFences = 15
export const maxPastureCells = 15
export const stableWoodCost = 2
export const minimumFenceSegments = 4

export const getFenceCount = <T extends { fenceSegments: FenceSegment[] }>(
  p: T,
): number => p.fenceSegments.reduce((n, s) => n + (s.type === 'fence' ? 1 : 0), 0)

export const getPalisadeCount = <T extends { fenceSegments: FenceSegment[] }>(
  p: T,
): number => p.fenceSegments.reduce((n, s) => n + (s.type === 'palisade' ? 1 : 0), 0)

export const getTotalPastureCells = (player: PlayerState) =>
  player.pastures.reduce((sum, pasture) => sum + pasture.size, 0)

export const canStartFencing = (
  _state: GameState,
  player: PlayerState,
  costOverride?: Partial<Resource>,
) => {
  if (getFenceCount(player) + minimumFenceSegments > maxFences) return false
  if (getTotalPastureCells(player) >= maxPastureCells) return false
  const free = Math.max(0, Math.abs(costOverride?.wood ?? 0))
  if (free > 0) {
    const woodCount = player.resources.wood ?? 0
    if (woodCount + free >= minimumFenceSegments) return true
  }
  return canAffordTypedFlatCost(player, { wood: minimumFenceSegments }, 'fencing')
}

type FencePayload = {
  edges?: string[]
  palisadeEdges?: string[]
  extraWood?: number
}

const applyPlayerMutation = (target: PlayerState, source: PlayerState) => {
  for (const key of Object.keys(target) as Array<keyof PlayerState>) {
    if (!(key in source)) {
      delete (target as Record<string, unknown>)[key as string]
    }
  }
  Object.assign(target, source)
}

const computeFreeFenceTotal = (
  state: GameState,
  player: PlayerState,
  newFenceEdges: string[],
  newPalisadeEdges: string[],
  space: ActionSpace | undefined,
): number => {
  const pendingFreeFences = readPendingFenceBonus(player)?.freeFences ?? 0
  const fenceOverride = collectComputeCostsForFarmChoice(
    state,
    player,
    'fence',
    { newFenceEdges, newPalisadeEdges },
    space,
  )
  const hookFreeFences = Math.max(0, Math.abs(fenceOverride.wood ?? 0))
  return pendingFreeFences + hookFreeFences
}

const finalizeFence = (
  ctx: ActionExecutionContext,
  edges: string[],
  palisadeEdges: string[],
  extraWood: number,
  paymentChoice: string | undefined,
): ActionExecutionResult => {
  const lockedKeys = collectLockedFarmTileKeys(ctx.player)
  const normalized = normalizePlayerFarm(ctx.player)
  const existingEdgeIds = new Set(
    (normalized.fenceSegments ?? []).map((seg) => seg.edge),
  )
  const newFenceEdgesPreview = edges.filter((e) => !existingEdgeIds.has(e))
  const newPalisadeEdgesPreview = palisadeEdges.filter(
    (e) => !existingEdgeIds.has(e),
  )
  const freeFences = computeFreeFenceTotal(
    ctx.state,
    normalized,
    newFenceEdgesPreview,
    newPalisadeEdgesPreview,
    ctx.space,
  )
  const validated = validateFenceSelection(
    normalized,
    edges,
    palisadeEdges,
    extraWood,
    freeFences,
    {
      skipPayment: true,
      allowPalisades: playerCanBuildPalisades(normalized),
    },
    lockedKeys,
  )
  if (!validated.ok) {
    return { type: 'fail', logKey: validated.error?.code ?? 'log.fencingFail' }
  }
  const payment = resolveTypedFlatPaymentSelection(
    validated.player as unknown as PlayerState,
    { wood: validated.payableWoodCost },
    'pay:fence',
    paymentChoice,
    { type: 'fail', logKey: 'log.fencingFail' },
    'fencing',
  )
  if (payment.type !== 'selected') {
    return { type: 'fail', logKey: 'log.fencingFail' }
  }
  const nextPlayer = JSON.parse(JSON.stringify(validated.player)) as PlayerState
  executeResolvedTypedFlatPayment(nextPlayer, payment, 'fencing')
  const consumed = consumePendingFenceBonus(nextPlayer, validated.newFenceEdges.length)
  applyPlayerMutation(ctx.player, nextPlayer)
  // Mirror commitFarmChoice farmChoiceMeta -> engine resultOverride.extraData:
  // listeners (E108, A83, …) read these from `context.result.extraData`.
  const extraData: Record<string, unknown> = {
    newFenceEdges: validated.newFenceEdges,
    newPalisadeEdges: validated.newPalisadeEdges,
    newPastures: validated.newPastures,
  }
  if (consumed) {
    extraData.usedFreeFences = consumed.usedFreeFences
    extraData.sourceCard = consumed.sourceCard
  }
  return { type: 'ok', extraData }
}

export const fenceAction: ActionDefinition = {
  id: 'fence',
  nameKey: 'actions.fencing.name',
  descriptionKey: 'actions.fencing.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) => canStartFencing(state, player),
  costPreview: {
    getBaseCost: () => ({ wood: minimumFenceSegments }),
    canExecute: (ctx, costOverride) =>
      canStartFencing(ctx.state, ctx.player, costOverride),
  },
  execute: () => ({
    type: 'choice',
    promptKey: 'ui.interactionFenceSelect',
    options: [
      { value: 'confirm', labelKey: 'ui.interactionFenceConfirm' },
      { value: 'cancel', labelKey: 'ui.interactionFenceCancel' },
    ],
  }),
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') return { type: 'ok' }

    // Second call: payment combo selected after multi-combo prompt.
    if (choice.startsWith('pay:fence:')) {
      const farmPayload = ctx.actionContext?.farmPayload as
        | { edges?: string[]; palisadeEdges?: string[]; extraWood?: number }
        | undefined
      if (!farmPayload) return { type: 'fail', logKey: 'log.fencingFail' }
      const edges = Array.isArray(farmPayload.edges) ? farmPayload.edges : []
      const palisadeEdges = Array.isArray(farmPayload.palisadeEdges)
        ? farmPayload.palisadeEdges
        : []
      const extraWood = farmPayload.extraWood ?? 0
      return finalizeFence(ctx, edges, palisadeEdges, extraWood, choice)
    }

    // First call: client submitted fence geometry alongside `confirm`.
    if (payload && choice === 'confirm') {
      const fp = payload as FencePayload
      const edges = Array.isArray(fp.edges) ? fp.edges : []
      const palisadeEdges = Array.isArray(fp.palisadeEdges) ? fp.palisadeEdges : []
      const extraWood = fp.extraWood ?? 0

      const lockedKeys = collectLockedFarmTileKeys(ctx.player)
      const normalized = normalizePlayerFarm(ctx.player)
      const existingEdgeIds = new Set(
        (normalized.fenceSegments ?? []).map((seg) => seg.edge),
      )
      const newFenceEdgesPreview = edges.filter((e) => !existingEdgeIds.has(e))
      const newPalisadeEdgesPreview = palisadeEdges.filter(
        (e) => !existingEdgeIds.has(e),
      )
      const freeFences = computeFreeFenceTotal(
        ctx.state,
        normalized,
        newFenceEdgesPreview,
        newPalisadeEdgesPreview,
        ctx.space,
      )
      const validated = validateFenceSelection(
        normalized,
        edges,
        palisadeEdges,
        extraWood,
        freeFences,
        {
          skipPayment: true,
          allowPalisades: playerCanBuildPalisades(normalized),
        },
        lockedKeys,
      )
      if (!validated.ok) {
        return { type: 'fail', logKey: validated.error?.code ?? 'log.fencingFail' }
      }
      const payment = resolveTypedFlatPaymentSelection(
        validated.player as unknown as PlayerState,
        { wood: validated.payableWoodCost },
        'pay:fence',
        undefined,
        { type: 'fail', logKey: 'log.fencingFail' },
        'fencing',
      )
      if (payment.type === 'choice') {
        return {
          type: 'choice',
          promptKey: payment.promptKey,
          options: payment.options ?? [],
          extraData: {
            actionContextWrite: {
              farmPayload: { edges, palisadeEdges, extraWood },
            },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', logKey: 'log.fencingFail' }
      }
      return finalizeFence(ctx, edges, palisadeEdges, extraWood, undefined)
    }

    return { type: 'fail', logKey: 'log.fencingFail' }
  },
}
