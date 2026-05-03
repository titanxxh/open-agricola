import type { ActionSpace, GameState, PlayerState, Resource } from '../../game/types.ts'
import {
  PAYMENT_CHOICE_REQUIRED_ERROR,
  executeResolvedTypedFlatPayment,
  resolveTypedFlatPaymentSelection,
} from '../../actions/helpers/pay-helpers.ts'
import { playerCanBuildPalisades } from '../../cards/helpers/card-type'
import {
  normalizePlayerFarm,
  type PlayerFarmState,
  validateFenceSelection,
} from './fence-validation.ts'
import {
  consumePendingFenceBonus,
  readPendingFenceBonus,
} from '../../cards/helpers/pending-fence-bonus.ts'
import { collectLockedFarmTileKeys } from '../../cards/card-effects.ts'
import { collectComputeCostsForFarmChoice } from '../../cards/card-listeners.ts'

export type FarmChoiceType = 'fence'

export type FarmChoicePayloadMap = {
  fence: { edges: string[]; palisadeEdges?: string[]; extraWood?: number }
}

type FarmChoiceOptions = {
  costOverride?: Partial<Resource>
  paymentChoice?: string
  state?: GameState
  space?: ActionSpace
}

export type FarmChoiceApplyResult<T extends PlayerState = PlayerState> =
  | {
      ok: true
      player: T
      meta?: {
        usedFreeFences?: number
        sourceCard?: string
        newFenceEdges?: string[]
        newPalisadeEdges?: string[]
        newPastures?: T['pastures']
      }
    }
  | { ok: false; error: string }

const getInsufficientResourceError = (
  player: PlayerFarmState,
  cost: Partial<Resource>,
) => {
  const missing = Object.entries(cost).find(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return false
    return (player.resources[key as keyof Resource] ?? 0) < value
  })
  return missing ? `Not enough ${missing[0]}` : 'Not enough resources'
}

export const applyFarmChoice = <T extends PlayerState>(
  player: T,
  farmType: FarmChoiceType,
  payload: FarmChoicePayloadMap[FarmChoiceType],
  options: FarmChoiceOptions = {},
): FarmChoiceApplyResult<T> => {
  const normalized = normalizePlayerFarm(player)
  const lockedKeys = collectLockedFarmTileKeys(player)

  switch (farmType) {
    case 'fence': {
      const { edges, palisadeEdges = [], extraWood } = payload as FarmChoicePayloadMap['fence']
      const freeFences = readPendingFenceBonus(normalized)?.freeFences ?? 0
      const adjustedExtraWood = extraWood ?? 0
      const existingEdgeIds = new Set(
        (normalized.fenceSegments ?? []).map((seg) => seg.edge),
      )
      const newFenceEdgesPreview = edges.filter((e) => !existingEdgeIds.has(e))
      const newPalisadeEdgesPreview = palisadeEdges.filter(
        (e) => !existingEdgeIds.has(e),
      )
      const fenceOverride = options.state
        ? collectComputeCostsForFarmChoice(
            options.state,
            normalized,
            'fence',
            {
              newFenceEdges: newFenceEdgesPreview,
              newPalisadeEdges: newPalisadeEdgesPreview,
            },
            options.space,
          )
        : { wood: 0 }
      const bonusFreeFences = Math.max(0, Math.abs(fenceOverride.wood ?? 0))
      const totalFreeFences = freeFences + bonusFreeFences
      const validated = validateFenceSelection(
        normalized,
        edges,
        palisadeEdges,
        adjustedExtraWood,
        totalFreeFences,
        {
          skipPayment: true,
          allowPalisades: playerCanBuildPalisades(normalized),
        },
        lockedKeys,
      )
      if (!validated.ok) {
        return { ok: false, error: validated.error?.code ?? 'validation failed' }
      }
      const resolvedPayment = resolveTypedFlatPaymentSelection(
        validated.player,
        { wood: validated.payableWoodCost },
        'pay:fence',
        options.paymentChoice,
        { type: 'fail', logKey: 'log.fencingFail' },
        'fencing',
      )
      if (resolvedPayment.type !== 'selected') {
        if (resolvedPayment.type === 'choice') {
          return { ok: false, error: PAYMENT_CHOICE_REQUIRED_ERROR }
        }
        if (options.paymentChoice) {
          return { ok: false, error: 'invalid payment choice' }
        }
        return { ok: false, error: getInsufficientResourceError(normalized, { wood: validated.payableWoodCost }) }
      }
      const nextPlayer = JSON.parse(JSON.stringify(validated.player)) as PlayerState
      executeResolvedTypedFlatPayment(nextPlayer, resolvedPayment, 'fencing')
      const consumed = consumePendingFenceBonus(
        nextPlayer,
        validated.newFenceEdges.length,
      )
      return {
        ok: true,
        player: nextPlayer as unknown as T,
        meta: {
          ...(consumed
            ? { usedFreeFences: consumed.usedFreeFences, sourceCard: consumed.sourceCard }
            : {}),
          newFenceEdges: validated.newFenceEdges,
          newPalisadeEdges: validated.newPalisadeEdges,
          newPastures: validated.newPastures as T['pastures'],
        },
      }
    }
  }
}
