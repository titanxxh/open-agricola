import type {
  ActionDefinition,
  FenceSegment,
  FenceSegmentType,
  GameState,
  FarmyardSpaceState,
  PlayerState,
  Resource,
  SupplyTokenKey,
} from '../../contract/types'
import type { EventSink } from '../../contract/events'
import {
  setCardFlag,
  writeCardInfobox,
  readCardExtraData,
  writeCardExtraData,
  popFromCardStack,
} from '../../cards/helpers/card-state'
import { incCounter, initCardState } from '../../cards/__stubs__/helpers'
import {
  fieldDecrementTop,
  fieldFindStackOfKind,
  fieldHasCrop,
  fieldPopIfDepleted,
  fieldTopStack,
} from '../../domain/field'
import { clearPendingFenceBonus } from '../../cards/helpers/pending-fence-bonus'
import { removeFutureMeeples } from './internal/future-meeples'
import { findFirstNewborn, findPlayerById } from '../../domain/player'
import { findActionSpaceById, removeWorkerRef } from '../../domain/space'
import { getNextEmptyTileForPlayer } from '../../domain/farm'
import { returnCardToBoard } from '../../cards/helpers/return-card'
import {
  isMajorImprovementAvailable,
  moveMajorImprovementToSupplyTop,
  swapMajorImprovementWithSupply,
} from '../../cards/major/supply'
import { isOwnOrdinaryFenceSegment } from '../../domain/fence-segments'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'
import { consumePendingExtraTurns } from '../../cards/card-effects'
import {
  SCORING_RESERVE_BONUS_KEY,
  canAddScoringReserve,
  normalizeScoringReserveResources,
} from '../../domain/scoring-reserve'
import { addFarmyardSpaceState, getFarmyardSpaceStates } from '../../domain/farmyard-space-states'
import { claimFarmyardGoodsTokens, claimFieldGoodsTokens } from '../../domain/farmyard-space-token-claims'
import {
  addConsumedSupplyTokenCount,
  getOwnOrdinaryFenceReserveCount,
} from '../../domain/supply-tokens'
import { getLogicalFields, mutateLogicalFields } from '../../cards/helpers/card-field'

export type PlantAdditionalGoodLocation =
  | { kind: 'field'; row: number; col: number }
  | { kind: 'card-field'; cardId: string }

type ResourceAccumulationTarget =
  | { kind: 'actionSpace'; spaceId: string }
  | { kind: 'card'; cardId: string; playerId?: string }
  | { kind: 'roundCard'; round: number }

export type SpecialEffectParams =
  | { kind: 'increment-extra-data'; key: string; amount: number }
  | { kind: 'set-extra-data'; key: string; value: unknown }
  | {
      kind: 'record-scoring-reserve-bonus'
      reserved: Partial<Resource>
      score: number
      cardType?: 'major' | 'minor' | 'occupation'
    }
  | { kind: 'emit-card-triggered'; accepted?: boolean; optional?: boolean; triggerActionId?: string }
  | { kind: 'increment-counter'; key: string; amount: number }
  | { kind: 'set-counter'; key: string; value: number }
  | { kind: 'pop-card-stack-top' }
  | { kind: 'move-major-improvement-to-top'; cardId: string }
  | { kind: 'swap-improvement-with-board'; from: string; to: string }
  | { kind: 'return-card-to-board'; cardId: string }
  | { kind: 'set-flag'; flag: boolean }
  | { kind: 'set-infobox'; text: string }
  | { kind: 'add-farmyard-space-state'; state: FarmyardSpaceState }
  | { kind: 'claim-farmyard-goods-tokens' }
  | { kind: 'claim-field-goods-tokens'; positions?: Array<{ row: number; col: number }> }
  | { kind: 'grow-field-and-non-field-crops' }
  | { kind: 'consume-supply-token'; key: SupplyTokenKey; amount?: number }
  | { kind: 'clear-pending-fence-bonus' }
  | { kind: 'consume-pending-extra-turns' }
  | { kind: 'remove-future-meeples'; rounds?: number[] }
  | { kind: 'promote-first-newborn' }
  | { kind: 'remove-field-crop'; crop: 'grain' | 'vegetable'; minRemaining?: number }
  | {
      kind: 'remove-field-crops'
      crop: 'grain' | 'vegetable'
      minRemaining?: number
      positions: Array<{ row: number; col: number }>
    }
  | {
      kind: 'consume-fence'
      count?: number
      segmentType?: FenceSegmentType
      sourcePolicy?: 'ownOnly'
    }
  | { kind: 'add-resource-to-space'; spaceId: string; resource: keyof Resource; amount: number }
  | { kind: 'add-resource-to-space'; target: ResourceAccumulationTarget; resource: keyof Resource; amount: number }
  | { kind: 'build-stable-on-first-empty-tile' }
  | {
      kind: 'move-resource-between-spaces'
      fromSpaceId: string
      toSpaceId: string
      resource: keyof Resource
      amount: number
    }
  | {
      kind: 'plant-additional-good'
      locations: PlantAdditionalGoodLocation[]
    }

const resolveTargetPlayer = (
  state: GameState | undefined,
  actor: PlayerState,
  actionContext: Record<string, unknown> | undefined,
): PlayerState => {
  const targetId = actionContext?.targetPlayerId
  if (typeof targetId !== 'string' || !targetId) return actor
  const target = state?.players?.find((p) => p.id === targetId)
  return target ?? actor
}

type CardFieldStack = {
  crop: 'grain' | 'vegetable' | 'wood' | 'stone'
  remaining: number
}

const readGrowableStack = <S extends { remaining: number }>(
  stacks: readonly (S | null)[],
  errCtx: string,
): S => {
  const stack = stacks.find((entry): entry is S => entry !== null && entry.remaining >= 1)
  if (!stack) {
    throw new Error(`plant-additional-good: no stack with remaining>=1 on ${errCtx}`)
  }
  return stack
}

const isPublicCardStateEventValue = (value: unknown): boolean => {
  if (value === null) return true
  const valueType = typeof value
  if (valueType === 'string' || valueType === 'boolean') return true
  if (valueType === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isPublicCardStateEventValue)
  return false
}

const RESOURCE_KEYS = new Set<keyof Resource>([
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'begging',
])

const resourceAmount = (resource: keyof Resource, amount: number): Partial<Resource> =>
  ({ [resource]: amount } as Partial<Resource>)

const readAccumulationTarget = (
  params: Extract<SpecialEffectParams, { kind: 'add-resource-to-space' }>,
): ResourceAccumulationTarget => {
  if ('target' in params) return params.target
  return { kind: 'actionSpace', spaceId: params.spaceId }
}

const stackResource = (item: string | undefined): Partial<Resource> | undefined => {
  if (!item || !RESOURCE_KEYS.has(item as keyof Resource)) return undefined
  return resourceAmount(item as keyof Resource, 1)
}

const emitCardStateChanged = (
  eventSink: EventSink | undefined,
  sourceCard: string,
  target: PlayerState,
  key: string,
  value: unknown,
): void => {
  if (!isPublicCardStateEventValue(value)) return
  eventSink?.emit<'card.stateChanged'>({
    type: 'card.stateChanged',
    sourceCardId: sourceCard,
    cardId: sourceCard,
    key,
    value,
    targetPlayerId: target.id,
  })
}

/**
 * Sprint 6a: `special-effect` is the canonical engine-mediated mutation
 * dispatcher. Cards that need to mutate `cardStates` from inside an action
 * flow should emit a SEQ child with `actionId: 'special-effect'` and the
 * appropriate params. Routing through this leaf — rather than direct
 * `writeCardExtraData(...)` inside listener handlers / execute callbacks —
 * keeps the engine in control of replay, snapshotting, and SEQ-optional
 * accept/decline semantics.
 */
export const specialEffectAction: ActionDefinition = {
  id: 'special-effect',
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, sourceCard, params, actionContext, eventSink }) => {
    if (!sourceCard) return { type: 'fail', errorKey: 'log.specialEffectFail' }
    const p = params as SpecialEffectParams | undefined
    if (!p || typeof p !== 'object' || !('kind' in p)) {
      return { type: 'fail', errorKey: 'log.specialEffectFail' }
    }
    const target = resolveTargetPlayer(state, player, actionContext)
    switch (p.kind) {
      case 'increment-extra-data': {
        const current = readCardExtraData<number>(target, sourceCard, p.key) ?? 0
        const next = current + p.amount
        writeCardExtraData(target, sourceCard, p.key, next)
        emitCardStateChanged(eventSink, sourceCard, target, p.key, next)
        return { type: 'ok' }
      }
      case 'set-extra-data':
        writeCardExtraData(target, sourceCard, p.key, p.value)
        if (p.value !== undefined && isPublicCardStateEventValue(p.value)) {
          emitCardStateChanged(eventSink, sourceCard, target, p.key, p.value)
        }
        return { type: 'ok' }
      case 'record-scoring-reserve-bonus':
        if (typeof p.score !== 'number' || !Number.isFinite(p.score)) {
          return { type: 'fail', errorKey: 'log.specialEffectFail' }
        }
        if (
          p.cardType !== undefined &&
          p.cardType !== 'major' &&
          p.cardType !== 'minor' &&
          p.cardType !== 'occupation'
        ) {
          return { type: 'fail', errorKey: 'log.specialEffectFail' }
        }
        {
          const reserved = normalizeScoringReserveResources(p.reserved)
          if (!reserved) return { type: 'fail', errorKey: 'log.specialEffectFail' }
          if (!canAddScoringReserve(target, reserved, { excludeCardId: sourceCard })) {
            return { type: 'fail', errorKey: 'log.specialEffectFail' }
          }
          if (p.score === 0 && Object.keys(reserved).length === 0) return { type: 'ok' }
          writeCardExtraData(target, sourceCard, SCORING_RESERVE_BONUS_KEY, {
            reserved,
            score: p.score,
            ...(p.cardType ? { cardType: p.cardType } : {}),
          })
        }
        return { type: 'ok' }
      case 'emit-card-triggered':
        eventSink?.emit<'card.triggered'>({
          type: 'card.triggered',
          cardId: sourceCard,
          sourceCardId: sourceCard,
          ...(p.triggerActionId ? { triggerActionId: p.triggerActionId } : {}),
          ...(typeof p.accepted === 'boolean' ? { accepted: p.accepted } : {}),
          ...(typeof p.optional === 'boolean' ? { optional: p.optional } : {}),
        })
        return { type: 'ok' }
      case 'increment-counter': {
        incCounter(target, sourceCard, p.key, p.amount)
        const next = target.cardStates?.[sourceCard]?.counters?.[p.key] ?? 0
        emitCardStateChanged(eventSink, sourceCard, target, p.key, next)
        return { type: 'ok' }
      }
      case 'set-counter': {
        const counters = initCardState(target, sourceCard)
        const next = Math.max(0, p.value)
        counters[p.key] = next
        emitCardStateChanged(eventSink, sourceCard, target, p.key, next)
        return { type: 'ok' }
      }
      case 'pop-card-stack-top': {
        const popped = popFromCardStack(target, sourceCard)
        const resources = stackResource(popped)
        eventSink?.emit<'card.stackChanged'>({
          type: 'card.stackChanged',
          sourceCardId: sourceCard,
          cardId: sourceCard,
          targetPlayerId: target.id,
          ...(resources ? { resources } : {}),
          delta: -1,
          reason: 'take',
        })
        return { type: 'ok' }
      }
      case 'move-major-improvement-to-top':
        if (!state) return { type: 'fail', errorKey: 'log.specialEffectFail' }
        moveMajorImprovementToSupplyTop(state, p.cardId)
        return { type: 'ok' }
      case 'swap-improvement-with-board': {
        if (!state) return { type: 'fail', errorKey: 'log.specialEffectFail' }
        const playerIndex = target.improvements.indexOf(p.from)
        if (playerIndex < 0 || !isMajorImprovementAvailable(state, p.to)) return { type: 'ok' }
        if (target.improvements.includes(p.to)) return { type: 'ok' }
        target.improvements[playerIndex] = p.to
        swapMajorImprovementWithSupply(state, p.from, p.to)
        eventSink?.emit<'card.swappedWithBoard'>({
          type: 'card.swappedWithBoard',
          sourceCardId: sourceCard,
          playerId: target.id,
          fromPlayerCardId: p.from,
          toPlayerCardId: p.to,
        })
        return { type: 'ok' }
      }
      case 'return-card-to-board':
        if (!state) return { type: 'fail', errorKey: 'log.specialEffectFail' }
        returnCardToBoard(target, p.cardId, state)
        eventSink?.emit<'card.returnedToBoard'>({
          type: 'card.returnedToBoard',
          sourceCardId: sourceCard,
          playerId: target.id,
          cardId: p.cardId,
        })
        return { type: 'ok' }
      case 'set-flag':
        setCardFlag(target, sourceCard, p.flag)
        emitCardStateChanged(eventSink, sourceCard, target, 'flagged', p.flag)
        return { type: 'ok' }
      case 'set-infobox':
        writeCardInfobox(target, sourceCard, p.text)
        eventSink?.emit<'card.infoboxChanged'>({
          type: 'card.infoboxChanged',
          sourceCardId: sourceCard,
          cardId: sourceCard,
          text: p.text,
          targetPlayerId: target.id,
        })
        return { type: 'ok' }
      case 'add-farmyard-space-state':
        addFarmyardSpaceState(target, p.state)
        return { type: 'ok' }
      case 'claim-farmyard-goods-tokens': {
        const gained = claimFarmyardGoodsTokens(target, sourceCard)
        if (Object.keys(gained).length > 0) {
          eventSink?.emit<'resource.moved'>({
            type: 'resource.moved',
            resources: gained,
            from: { kind: 'card', playerId: target.id, cardId: sourceCard },
            to: { kind: 'player', playerId: target.id },
            reason: 'cardEffect',
            sourceCardId: sourceCard,
          })
        }
        return { type: 'ok' }
      }
      case 'claim-field-goods-tokens': {
        const positions = Array.isArray(p.positions)
          ? p.positions.filter((pos): pos is { row: number; col: number } =>
              Number.isFinite(pos?.row) && Number.isFinite(pos?.col),
            )
          : undefined
        const gained = claimFieldGoodsTokens(target, sourceCard, positions)
        if (Object.keys(gained).length > 0) {
          eventSink?.emit<'resource.moved'>({
            type: 'resource.moved',
            resources: gained,
            from: { kind: 'card', playerId: target.id, cardId: sourceCard },
            to: { kind: 'player', playerId: target.id },
            reason: 'cardEffect',
            sourceCardId: sourceCard,
          })
        }
        return { type: 'ok' }
      }
      case 'grow-field-and-non-field-crops': {
        const mutations = mutateLogicalFields(state, target, { sourceCard, eventSink })
        for (const field of getLogicalFields(target)) {
          const slot = field.slots.find((entry) =>
            (entry.stack?.kind === 'grain' || entry.stack?.kind === 'vegetable') &&
            entry.stack.remaining > 0,
          )
          if (slot) mutations.grow({ fieldId: field.id, slot: slot.index })
        }
        target.farmyardSpaceStates = getFarmyardSpaceStates(target).map((entry) => {
          if (
            entry.kind !== 'non-field-crop-space' ||
            !entry.crop ||
            (entry.crop.kind !== 'grain' && entry.crop.kind !== 'vegetable') ||
            entry.crop.remaining <= 0
          ) {
            return entry
          }
          return {
            ...entry,
            crop: { ...entry.crop, remaining: entry.crop.remaining + 1 },
          }
        })
        return { type: 'ok' }
      }
      case 'consume-supply-token': {
        const amount = p.amount ?? 1
        if (amount <= 0) return { type: 'ok' }
        if (p.key !== 'fence') return { type: 'fail', errorKey: 'log.specialEffectFail' }
        const available = getOwnOrdinaryFenceReserveCount(target)
        if (available < amount) return { type: 'fail', errorKey: 'log.specialEffectFail' }
        addConsumedSupplyTokenCount(target, p.key, amount)
        eventSink?.emit<'farm.fenceConsumed'>({
          type: 'farm.fenceConsumed',
          sourceCardId: sourceCard,
          count: amount,
          reason: 'cardEffect',
        })
        return { type: 'ok' }
      }
      case 'clear-pending-fence-bonus':
        clearPendingFenceBonus(target)
        emitCardStateChanged(eventSink, sourceCard, target, 'pendingFenceBonus', null)
        return { type: 'ok' }
      case 'consume-pending-extra-turns': {
        if (!state) return { type: 'fail', errorKey: 'log.specialEffectFail' }
        const consumed = consumePendingExtraTurns(state, target)
        if (consumed > 0) {
          eventSink?.emit<'card.triggered'>({
            type: 'card.triggered',
            cardId: sourceCard,
            sourceCardId: sourceCard,
          })
        }
        return { type: 'ok' }
      }
      case 'remove-future-meeples': {
        if (!state) return { type: 'fail', errorKey: 'log.specialEffectFail' }
        const futureBefore = state.futureMeeples.length
        removeFutureMeeples(state, {
          playerId: target.id,
          cardId: sourceCard,
          rounds: p.rounds,
        })
        if (state.futureMeeples.length < futureBefore) {
          eventSink?.emit<'futureMeeple.removed'>({
            type: 'futureMeeple.removed',
            sourceCardId: sourceCard,
            playerId: target.id,
            cardId: sourceCard,
            ...(p.rounds ? { rounds: p.rounds } : {}),
          })
        }
        return { type: 'ok' }
      }
      case 'promote-first-newborn': {
        if (!state) return { type: 'fail', errorKey: 'log.specialEffectFail' }
        const newborn = findFirstNewborn(target)
        if (!newborn) return { type: 'ok' }
        newborn.isNewborn = false
        for (const space of state.actionSpaces) {
          removeWorkerRef(space, target.id, newborn.id)
        }
        eventSink?.emit<'worker.promoted'>({
          type: 'worker.promoted',
          sourceCardId: sourceCard,
          playerId: target.id,
          workerId: newborn.id,
          from: 'newborn',
          to: 'adult',
        })
        return { type: 'ok' }
      }
      case 'remove-field-crop': {
        // Used by C57 Crudite-style "discard 1 crop on top of another" effects.
        // Picks the FIRST player field that has the crop with at least
        // `minRemaining` left (default 2 — the reference "stacked on another"
        // semantics) and decrements its top stack by 1. No-op if no field
        // qualifies.
        const minRem = p.minRemaining ?? 2
        const field = target.fields.find(
          (f) =>
            fieldHasCrop(f, p.crop) &&
            (fieldFindStackOfKind(f, p.crop)?.remaining ?? 0) >= minRem,
        )
        if (!field) return { type: 'ok' }
        const stack = fieldFindStackOfKind(field, p.crop)
        if (!stack) return { type: 'ok' }
        stack.remaining -= 1
        fieldPopIfDepleted(field)
        eventSink?.emit<'farm.cropRemoved'>({
          type: 'farm.cropRemoved',
          sourceCardId: sourceCard,
          crops: [
            {
              location: { kind: 'field', playerId: target.id, row: field.row, col: field.col },
              crop: p.crop,
              amount: 1,
            },
          ],
          reason: 'cardEffect',
        })
        return { type: 'ok' }
      }
      case 'remove-field-crops': {
        if (!Array.isArray(p.positions) || p.positions.length === 0) {
          return { type: 'fail', errorKey: 'log.specialEffectFail' }
        }
        const minRem = p.minRemaining ?? 1
        const seen = new Set<string>()
        const fields = []
        for (const pos of p.positions) {
          if (!pos || typeof pos !== 'object') {
            return { type: 'fail', errorKey: 'log.specialEffectFail' }
          }
          const { row, col } = pos
          if (!Number.isFinite(row) || !Number.isFinite(col)) {
            return { type: 'fail', errorKey: 'log.specialEffectFail' }
          }
          const key = `${row}:${col}`
          if (seen.has(key)) {
            return { type: 'fail', errorKey: 'log.specialEffectFail' }
          }
          seen.add(key)
          const field = target.fields.find((f) => f.row === row && f.col === col)
          const top = field ? fieldTopStack(field) : undefined
          if (!field || top?.kind !== p.crop || top.remaining < minRem) {
            return { type: 'fail', errorKey: 'log.specialEffectFail' }
          }
          fields.push(field)
        }
        for (const field of fields) {
          fieldDecrementTop(field)
        }
        eventSink?.emit<'farm.cropRemoved'>({
          type: 'farm.cropRemoved',
          sourceCardId: sourceCard,
          crops: fields.map((field) => ({
            location: { kind: 'field' as const, playerId: target.id, row: field.row, col: field.col },
            crop: p.crop,
            amount: 1,
          })),
          reason: 'cardEffect',
        })
        return { type: 'ok' }
      }
      case 'consume-fence': {
        const count = p.count ?? 1
        const segmentType = p.segmentType ?? 'fence'
        const sourcePolicy = p.sourcePolicy
        const matches = (segment: FenceSegment) => {
          if (segment.type !== segmentType) return false
          if (sourcePolicy === 'ownOnly') return isOwnOrdinaryFenceSegment(segment, target.id)
          return true
        }
        const matchingIndexes: number[] = []
        for (let i = target.fenceSegments.length - 1; i >= 0; i -= 1) {
          if (matches(target.fenceSegments[i]!)) {
            matchingIndexes.push(i)
          }
        }
        if (matchingIndexes.length < count) {
          return { type: 'fail', errorKey: 'log.specialEffectFail' }
        }
        const indexesToRemove = matchingIndexes.slice(0, count)
        for (const index of indexesToRemove) {
          target.fenceSegments.splice(index, 1)
        }
        eventSink?.emit<'farm.fenceConsumed'>({
          type: 'farm.fenceConsumed',
          sourceCardId: sourceCard,
          count: indexesToRemove.length,
          reason: 'cardEffect',
        })
        return { type: 'ok' }
      }
      case 'add-resource-to-space': {
        if (!state) return { type: 'fail', errorKey: 'log.specialEffectFail' }
        const accumulationTarget = readAccumulationTarget(p)
        const resources = resourceAmount(p.resource, p.amount)
        if (accumulationTarget.kind === 'actionSpace') {
          const targetSpace = findActionSpaceById(state, accumulationTarget.spaceId)
          if (!targetSpace?.resources) {
            return { type: 'fail', errorKey: 'log.specialEffectFail' }
          }
          const current =
            (targetSpace.resources as Partial<Record<keyof Resource, number>>)[p.resource] ?? 0
          ;(targetSpace.resources as Record<keyof Resource, number>)[p.resource] =
            current + p.amount
          if (p.amount > 0) {
            eventSink?.emit<'action.accumulated'>({
              type: 'action.accumulated',
              sourceCardId: sourceCard,
              spaceId: accumulationTarget.spaceId,
              resources,
            })
          }
          return { type: 'ok' }
        }
        if (accumulationTarget.kind === 'card') {
          const targetPlayer = accumulationTarget.playerId
            ? findPlayerById(state, accumulationTarget.playerId) ?? target
            : target
          const counters = initCardState(targetPlayer, accumulationTarget.cardId)
          counters[p.resource] = (counters[p.resource] ?? 0) + p.amount
          if (p.amount > 0) {
            eventSink?.emit<'resource.accumulated'>({
              type: 'resource.accumulated',
              sourceCardId: sourceCard,
              resources,
              to: {
                kind: 'card',
                playerId: targetPlayer.id,
                cardId: accumulationTarget.cardId,
              },
            })
          }
          return { type: 'ok' }
        }
        if (p.amount > 0) {
          eventSink?.emit<'resource.accumulated'>({
            type: 'resource.accumulated',
            sourceCardId: sourceCard,
            resources,
            to: { kind: 'roundCard', round: accumulationTarget.round },
          })
        }
        return { type: 'ok' }
      }
      case 'build-stable-on-first-empty-tile': {
        if (!state || getAvailableStableSupplyCount(state, target) <= 0) return { type: 'ok' }
        const tile = getNextEmptyTileForPlayer(target)
        if (!tile) return { type: 'ok' }
        target.stableTiles.push(tile)
        eventSink?.emit<'farm.stableBuilt'>({
          type: 'farm.stableBuilt',
          sourceCardId: sourceCard,
          stables: [{ playerId: target.id, row: tile.row, col: tile.col }],
        })
        return { type: 'ok' }
      }
      case 'move-resource-between-spaces': {
        if (!state) return { type: 'fail', errorKey: 'log.specialEffectFail' }
        const from = findActionSpaceById(state, p.fromSpaceId)
        const to = findActionSpaceById(state, p.toSpaceId)
        if (!from?.resources || !to?.resources) {
          return { type: 'fail', errorKey: 'log.specialEffectFail' }
        }
        const have = (from.resources as Partial<Record<keyof Resource, number>>)[p.resource] ?? 0
        if (have < p.amount) {
          return { type: 'fail', errorKey: 'log.specialEffectFail' }
        }
        ;(from.resources as Record<keyof Resource, number>)[p.resource] = have - p.amount
        const dest = (to.resources as Partial<Record<keyof Resource, number>>)[p.resource] ?? 0
        ;(to.resources as Record<keyof Resource, number>)[p.resource] = dest + p.amount
        eventSink?.emit<'resource.moved'>({
          type: 'resource.moved',
          sourceCardId: sourceCard,
          resources: resourceAmount(p.resource, p.amount),
          from: { kind: 'actionSpace', spaceId: p.fromSpaceId },
          to: { kind: 'actionSpace', spaceId: p.toSpaceId },
          reason: 'cardEffect',
        })
        return { type: 'ok' }
      }
      case 'plant-additional-good': {
        const mutations: Array<() => void> = []
        const crops: Array<{
          location:
            | { kind: 'field'; playerId: string; row: number; col: number }
            | { kind: 'card'; playerId: string; cardId: string }
          crop: 'grain' | 'vegetable' | 'wood' | 'stone'
          amount: number
        }> = []
        for (const loc of p.locations) {
          if (loc.kind === 'field') {
            const field = target.fields.find(
              (f) => f.row === loc.row && f.col === loc.col,
            )
            if (!field) {
              throw new Error(
                `plant-additional-good: missing field at row=${loc.row} col=${loc.col}`,
              )
            }
            const stack = readGrowableStack(field.stacks, `field row=${loc.row} col=${loc.col}`)
            crops.push({
              location: { kind: 'field', playerId: target.id, row: loc.row, col: loc.col },
              crop: stack.kind,
              amount: 1,
            })
            mutations.push(() => {
              stack.remaining += 1
            })
          } else {
            const stacks =
              readCardExtraData<CardFieldStack[]>(target, loc.cardId, 'cardFieldStacks') ?? []
            const stack = readGrowableStack(stacks, `card ${loc.cardId}`)
            crops.push({
              location: { kind: 'card', playerId: target.id, cardId: loc.cardId },
              crop: stack.crop,
              amount: 1,
            })
            mutations.push(() => {
              stack.remaining += 1
              writeCardExtraData(target, loc.cardId, 'cardFieldStacks', stacks)
            })
          }
        }
        for (const mutate of mutations) mutate()
        if (crops.length > 0) {
          eventSink?.emit<'farm.cropAdded'>({
            type: 'farm.cropAdded',
            sourceCardId: sourceCard,
            crops,
            reason: 'cardEffect',
          })
        }
        return { type: 'ok' }
      }
    }
  },
}
