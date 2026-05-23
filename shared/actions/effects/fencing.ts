import type {
  ActionDefinition,
  ActionExecutionResult,
  ActionMutationContext,
  ActionSpace,
  FenceSegment,
  GameState,
  PlayerState,
  Resource,
} from '../../contract/types'
// PaymentSolver namespace (S3 Task 7b): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
// fencing.ts only uses typed-flat helpers (shim scope), so no PaymentSolver
// call sites exist here yet.
import {
  canAffordTypedFlatCost,
  resolveTypedFlatPaymentSelection,
} from '../payment/internal'
import { buildInternalPayChild } from '../helpers/pay-child'
import { playerBoard, normalizePlayerFarm } from '../../domain'
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
  const pendingFreeFences = readPendingFenceBonus(player)?.freeFences ?? 0
  const free = pendingFreeFences + Math.max(0, Math.abs(costOverride?.wood ?? 0))
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

const positiveResources = (resources: Partial<Resource>): Partial<Resource> => {
  const result: Partial<Resource> = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    result[key as keyof Resource] = value
  })
  return result
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
  ctx: ActionMutationContext,
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
  const idx = ctx.state.players.indexOf(ctx.player)
  const validated = playerBoard(ctx.state, idx).farmyard.canBuildFence({
    edges,
    palisadeEdges,
    extraWood,
    freeFences,
    options: {
      skipPayment: true,
      allowPalisades: playerCanBuildPalisades(normalized),
    },
    lockedKeys,
  })
  if (!validated.ok) {
    return { type: 'fail', errorKey: validated.error?.code ?? 'log.fencingFail' }
  }
  const payment = resolveTypedFlatPaymentSelection(
    validated.player as unknown as PlayerState,
    { wood: validated.payableWoodCost },
    'pay:fence',
    paymentChoice,
    { type: 'fail', errorKey: 'log.fencingFail' },
    'fencing',
  )
  if (payment.type !== 'selected') {
    return { type: 'fail', errorKey: 'log.fencingFail' }
  }
  const nextPlayer = JSON.parse(JSON.stringify(validated.player)) as PlayerState
  const consumed = consumePendingFenceBonus(nextPlayer, validated.newFenceEdges.length)
  applyPlayerMutation(ctx.player, nextPlayer)
  const paidResources = positiveResources(payment.solution.resourcesPaid)
  const builtFences = [
    ...validated.newFenceEdges.map((edge) => ({ edge, type: 'fence' })),
    ...validated.newPalisadeEdges.map((edge) => ({ edge, type: 'palisade' })),
  ]
  if (builtFences.length > 0) {
    ctx.eventSink?.emit<'farm.fenceBuilt'>({
      type: 'farm.fenceBuilt',
      fences: builtFences,
      newFenceEdges: validated.newFenceEdges,
      newPastures: validated.newPastures,
    })
  }
  const extraData: Record<string, unknown> = {
    newFenceEdges: validated.newFenceEdges,
    newPalisadeEdges: validated.newPalisadeEdges,
    newPastures: validated.newPastures,
  }
  if (consumed) {
    extraData.usedFreeFences = consumed.usedFreeFences
    extraData.sourceCard = consumed.sourceCard
    if (consumed.usedFreeFences > 0) {
      ctx.eventSink?.emit<'farm.fenceConsumed'>({
        type: 'farm.fenceConsumed',
        count: consumed.usedFreeFences,
        reason: 'cardEffect',
      })
    }
  }
  return {
    type: 'ok',
    resourcesPaid: paidResources,
    extraData,
    internalChildren: {
      beforeHostListeners: [
        buildInternalPayChild({
          cost: { fee: { wood: validated.payableWoodCost } },
          costType: 'fencing',
          optionPrefix: 'pay:fence',
          paymentChoice,
          sourceCard: ctx.sourceCard,
          sourceActionId: ctx.space.id,
        }),
      ],
    },
  }
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
  execute: ({ state, player, space }): ActionExecutionResult => {
    const idx = state.players.indexOf(player)
    const farm = playerBoard(state, idx).farmyard.selectableTiles('fence', { spaceId: space.id })
    return {
      type: 'request',
      request: {
        kind: 'farm-select',
        farm,
        options: [
          { value: 'confirm', labelKey: 'ui.interactionFenceConfirm' },
          { value: 'cancel', labelKey: 'ui.interactionFenceCancel' },
        ],
      },
      promptKey: 'ui.interactionFenceSelect',
    }
  },
  resolveChoice: (ctx, choice, payload): ActionExecutionResult => {
    if (choice === 'cancel') return { type: 'ok' }

    // Second call: payment combo selected after multi-combo prompt.
    if (choice.startsWith('pay:fence:')) {
      const farmPayload = ctx.actionContext?.farmPayload as
        | { edges?: string[]; palisadeEdges?: string[]; extraWood?: number }
        | undefined
      if (!farmPayload) return { type: 'fail', errorKey: 'log.fencingFail' }
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
      const idx = ctx.state.players.indexOf(ctx.player)
      const validated = playerBoard(ctx.state, idx).farmyard.canBuildFence({
        edges,
        palisadeEdges,
        extraWood,
        freeFences,
        options: {
          skipPayment: true,
          allowPalisades: playerCanBuildPalisades(normalized),
        },
        lockedKeys,
      })
      if (!validated.ok) {
        return { type: 'fail', errorKey: validated.error?.code ?? 'log.fencingFail' }
      }
      const payment = resolveTypedFlatPaymentSelection(
        validated.player as unknown as PlayerState,
        { wood: validated.payableWoodCost },
        'pay:fence',
        undefined,
        { type: 'fail', errorKey: 'log.fencingFail' },
        'fencing',
      )
      if (payment.type === 'request') {
        const options = payment.request.kind === 'choice' ? payment.request.options : []
        return {
          type: 'request',
          request: { kind: 'choice', options },
          promptKey: payment.promptKey,
          extraData: {
            actionContextWrite: {
              farmPayload: { edges, palisadeEdges, extraWood },
            },
          },
        }
      }
      if (payment.type === 'fail') {
        return { type: 'fail', errorKey: 'log.fencingFail' }
      }
      return finalizeFence(ctx, edges, palisadeEdges, extraWood, undefined)
    }

    return { type: 'fail', errorKey: 'log.fencingFail' }
  },
}
