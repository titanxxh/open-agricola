import type { PersonUseReceipt } from '../../contract/person-use'
import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionExecutionResult,
  ActionFlow,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../contract/types'
import { resetComputeReplaceGuards } from '../../engine/replace-guard'
import { recordRoundPlacement } from '../../cards/helpers/round-placement'
import { writeActionSnapshotExtraData } from '../../cards/helpers/action-snapshot'
import {
  addLinkedSpaceBlocks,
  addWorkerRef,
  clearLinkedSpaceBlocksForWorker,
  findActionSpaceById,
  findActionSpaceByWorker,
  removeWorkerRef,
} from '../../domain/space'
import { smallestAvailableWorker } from '../../domain/player'
import { dispatchableGuests } from '../../domain/guests'
import { selectWorkerForMoorAction } from '../../moor/heating'
import { incPlacedFarmers } from '../../session/stats'
import type { ActionHookRegistry } from '../hooks'
import { computeAllowedPlacementSpaces } from '../helpers/placement-availability'
import { missingBuildingResourceSpaceIds } from '../helpers/missing-building-resource-spaces'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../helpers/placement-constants'
import { declaresPlacementPerson, resolvePlacementPerson, type PlacementPerson } from '../helpers/placement-person'
import { collectBeforeActionSpaceUseFlows } from '../../cards/card-listeners'
import { recordActionSpaceUse } from '../../domain/action-space-use'

export { OCCUPIED_SPACE_CHOICE_PREFIX } from '../helpers/placement-constants'

/** Marks a card's placement whose person has been chosen as a family member. */
const FAMILY_PERSON_KEY = 'familyPerson'

/**
 * Low-level helper: place a worker belonging to `player` onto `space`.
 *
 * Picks the smallest-id worker currently at home via `smallestAvailableWorker`.
 * This helper does NOT guard against already-occupied spaces — callers that
 * respect the "space free" rule must check `isSpaceOccupied(space)` first.
 * (canUseOccupied paths bypass that check intentionally.)
 */
const usesLiveBuildingResourceConstraints = (
  actionContext: Record<string, unknown> | undefined,
): boolean => actionContext?.constraintsMode === 'missing-building-resource'

const constrainPlacements = <T extends { spaceId: string }>(
  allowed: T[],
  state: GameState,
  player: PlayerState,
  actionContext: Record<string, unknown> | undefined,
): T[] => {
  if (usesLiveBuildingResourceConstraints(actionContext)) {
    const allowSet = new Set(missingBuildingResourceSpaceIds(state, player))
    return allowed.filter((placement) => allowSet.has(placement.spaceId))
  }
  const constraints = actionContext?.constraints
  if (!Array.isArray(constraints) || constraints.length === 0) return allowed
  const allowSet = new Set(constraints.filter((id): id is string => typeof id === 'string'))
  return allowed.filter((placement) => allowSet.has(placement.spaceId))
}

const legalPlacements = (
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry | undefined,
  sourceCard: string | undefined,
  actionContext: Record<string, unknown> | undefined,
  person = resolvePlacementPerson({ state, player, actionContext, sourceCard }),
) => {
  const allowed = constrainPlacements(computeAllowedPlacementSpaces(state, player, {
    actionHooks,
    sourceCard,
    actionContext,
    ignoreWorkerAvailability: person !== undefined,
  }), state, player, actionContext)
  const allowsSpace = person?.allowsSpace
  if (!allowsSpace) return allowed
  return allowed.filter((placement) => {
    const space = findActionSpaceById(state, placement.spaceId)
    return space !== undefined && allowsSpace(space)
  })
}

export function hasLegalPlaceFarmerTargets(
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry | undefined,
  sourceCard: string | undefined,
  actionContext: Record<string, unknown> | undefined,
): boolean {
  return legalPlacements(state, player, actionHooks, sourceCard, actionContext).length > 0
}

const placementOptions = (
  state: GameState,
  allowed: { spaceId: string; allowOccupied: boolean; option?: ActionChoiceOption }[],
): ActionChoiceOption[] => allowed.map((placement) => {
  const space = findActionSpaceById(state, placement.spaceId)!
  return {
    value: placement.allowOccupied ? `${OCCUPIED_SPACE_CHOICE_PREFIX}${placement.spaceId}` : placement.spaceId,
    labelKey: placement.option?.labelKey ?? space.nameKey,
    labelParams: placement.option?.labelParams,
    sourceCard: placement.option?.sourceCard,
    effectPreview: placement.option?.effectPreview,
    descriptionPreview: placement.option?.descriptionPreview,
    disabled: placement.option?.disabled,
    disabledReasonKey: placement.option?.disabledReasonKey,
  }
})

const placeFarmer = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
): ActionExecutionResult & { workerId?: string; personUse?: PersonUseReceipt } => {
  const worker = selectWorkerForMoorAction(state, player, space.id)
  if (!worker) {
    return { type: 'fail', errorKey: 'log.placeFarmerFail' }
  }
  addWorkerRef(space, player.id, worker.id)
  addLinkedSpaceBlocks(state, space, player.id, worker.id)
  const personUse = recordRoundPlacement(player, space.id, worker.id)
  return { type: 'ok', workerId: worker.id, personUse }
}

const placePerson = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
  person: PlacementPerson,
): ActionExecutionResult & { workerId?: string; personUse?: PersonUseReceipt } => {
  const workerId = person.enter(space)
  if (!workerId) return { type: 'fail', errorKey: 'log.placeFarmerFail' }
  addWorkerRef(space, player.id, workerId)
  addLinkedSpaceBlocks(state, space, player.id, workerId)
  const personUse = recordRoundPlacement(player, space.id, workerId)
  return { type: 'ok', workerId, personUse }
}

/**
 * The Guests of this round a card's "place another person" may send instead of a family
 * member: those a legal target awaits under this placement's constraints. An ordinary
 * turn's placement has no source card, and rotation offers Guests on their own.
 */
const cardPlacementGuests = (
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry | undefined,
  sourceCard: string | undefined,
  actionContext: Record<string, unknown> | undefined,
) => sourceCard === undefined || declaresPlacementPerson(actionContext) || actionContext?.[FAMILY_PERSON_KEY] === true
  ? []
  : dispatchableGuests(state, player).filter(guest => legalPlacements(state, player, actionHooks, sourceCard,
    { ...actionContext, workerSource: { kind: 'guest', guestId: guest.id } }).length > 0)

/** Asks which person a card's placement sends when a Guest could go; a single candidate goes directly. */
const choosePlacementPerson = (
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry | undefined,
  sourceCard: string | undefined,
  actionContext: Record<string, unknown> | undefined,
): ActionFlow | undefined => {
  const guests = cardPlacementGuests(state, player, actionHooks, sourceCard, actionContext)
  if (guests.length === 0) return
  const familyContext = { ...actionContext, [FAMILY_PERSON_KEY]: true }
  const family = smallestAvailableWorker(state, player) !== null
    && legalPlacements(state, player, actionHooks, sourceCard, familyContext).length > 0
  const choices: ActionFlow[] = [
    ...(family ? [{
      type: 'leaf' as const, actionId: 'place-farmer', sourceCard, actionContext: familyContext,
      choiceLabelKey: 'actions.place-farmer.name',
    }] : []),
    ...guests.map((guest): ActionFlow => ({
      type: 'leaf', actionId: 'place-farmer', sourceCard,
      actionContext: { ...actionContext, workerSource: { kind: 'guest', guestId: guest.id } },
      choiceLabelKey: 'actions.activate-extra-turn.name',
      choiceLabelParams: { guestId: guest.id, guestCardId: guest.sourceCardId },
    })),
  ]
  return choices.length === 1 ? choices[0] : { type: 'xor', children: choices }
}

const placementPersonAvailable = (
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry | undefined,
  sourceCard: string | undefined,
  actionContext: Record<string, unknown> | undefined,
): boolean => {
  const person = resolvePlacementPerson({ state, player, actionContext, sourceCard })
  if (!person) return false
  return !person.needsTarget || legalPlacements(state, player, actionHooks, sourceCard, actionContext, person).length > 0
}

export const placeFarmerAction: ActionDefinition = {
  id: 'place-farmer',
  nameKey: 'actions.place-farmer.name',
  descriptionKey: 'actions.place-farmer.description',
  roundAvailable: 1,
  gainPerRound: {},
  projectInteractionRequest: (state, player, request, actionContext, actionHooks, sourceCard) => {
    if (!usesLiveBuildingResourceConstraints(actionContext) || request.kind !== 'choice' || !actionHooks) return { request }
    const options = placementOptions(state, legalPlacements(state, player, actionHooks, sourceCard, actionContext))
    const unchanged = options.length === request.options.length && options.every((option, index) => {
      const current = request.options[index]
      return option.value === current?.value
        && option.labelKey === current?.labelKey
        && option.disabled === current?.disabled
        && option.disabledReasonKey === current?.disabledReasonKey
        && option.sourceCard === current?.sourceCard
    })
    return { request: unchanged ? request : { ...request, options } }
  },
  canBeExecutedByPlayer: (state, player, context) =>
    context?.actionContext?.viaCardJump === true
      ? context.actionContext.workerId === undefined || (
        typeof context.actionContext.workerId === 'string'
        && findActionSpaceByWorker(state, player.id, context.actionContext.workerId) !== undefined
      )
      : declaresPlacementPerson(context?.actionContext)
      ? placementPersonAvailable(state, player, context?.actionHooks, context?.sourceCard, context?.actionContext)
      : smallestAvailableWorker(state, player) !== null
        || cardPlacementGuests(state, player, context?.actionHooks, context?.sourceCard, context?.actionContext).length > 0,
  previewEffect: ({ state, actionContext }) => {
    const constraints = actionContext?.constraints
    const fixedTarget = Array.isArray(constraints) && constraints.length === 1 && typeof constraints[0] === 'string'
      ? constraints[0] : undefined
    const target = state.actionSpaces.find((space) => space.id === (actionContext?.targetSpaceId ?? fixedTarget))
    return target ? { kind: 'actionSpace', spaceId: target.id, nameKey: target.nameKey } : undefined
  },
  execute: ({ actionHooks, state, player, sourceCard, actionContext, eventSink, completedTransactionEvents }) => {
    // viaCardJump branch (Sprint 5 mech-A): move farmer + return flow leaf so
    // the engine runs the second placement through the standard ActionNode path.
    if (actionContext?.viaCardJump) {
      const sourceCard = actionContext.sourceCard as string | undefined
      const workerId = actionContext.workerId as string | undefined
      const targetSpaceId = actionContext.targetSpaceId as string | undefined
      if (!sourceCard || !targetSpaceId) {
        return { type: 'fail', errorKey: 'log.placeFarmerFail' }
      }

      // worker-less mode: A151-style "use this action space" trigger during
      // return-home phase, where there is no farmer in hand to relocate.
      const isWorkerless = !workerId

      let fromSpace: ActionSpace | undefined
      if (!isWorkerless) {
        fromSpace = findActionSpaceByWorker(state, player.id, workerId)
        if (!fromSpace) {
          return { type: 'fail', errorKey: 'log.placeFarmerFail' }
        }
      }
      const targetSpace = findActionSpaceById(state, targetSpaceId)
      if (!targetSpace) {
        return { type: 'fail', errorKey: 'log.placeFarmerFail' }
      }

      // Reachability check only applies to worker mode (worker-less is invoked
      // by cards that have already verified the space is unoccupied / valid).
      if (!isWorkerless) {
        const allowed = computeAllowedPlacementSpaces(state, player, { actionHooks, actionSpaceUse: { newPlacement: false }, sourceCard, actionContext, ignoreWorkerAvailability: true })
        if (!allowed.some(a => a.spaceId === targetSpaceId)) {
          return { type: 'fail', errorKey: 'log.placeFarmerFail' }
        }
      }

      actionContext.jumpChain = [
        ...((actionContext.jumpChain as string[] | undefined) ?? []),
        sourceCard,
      ]

      if (!isWorkerless && fromSpace) {
        removeWorkerRef(fromSpace, player.id, workerId!)
        clearLinkedSpaceBlocksForWorker(state, player.id, workerId!)
        addWorkerRef(targetSpace, player.id, workerId!)
        addLinkedSpaceBlocks(state, targetSpace, player.id, workerId!)
        recordRoundPlacement(player, targetSpace.id, workerId!, true)
        incPlacedFarmers(player)
        eventSink?.emit<'worker.placed'>({
          type: 'worker.placed',
          workerId: workerId!,
          spaceId: targetSpaceId,
          viaCardId: sourceCard,
        })
      }

      // Hand the second placement to the engine via a leaf with `expandFlow`.
      // When the target action defines an inner flow, the engine's
      // buildFlowNode expands it into the action's flow subtree (with
      // sourceCard + actionContext merged into every inner leaf). When the
      // target has no inner flow (grain-seeds / day-laborer / traveling-players),
      // the engine falls back to the standard ActionNode path. This mirrors
      // the `createEngine(actionId)` semantics used when the player triggers
      // the action directly via takeAction.
      const use = recordActionSpaceUse({ state, player, space: targetSpace, eventSink, sourceCard, completedTransactionEvents }, { newPlacement: false })
      const targetLeaf: ActionFlow = {
        type: 'leaf',
        actionId: targetSpaceId,
        spaceUse: use,
        expandFlow: true,
        sourceCard,
        actionContext: resetComputeReplaceGuards(actionContext),
      }
      const beforeFlows = collectBeforeActionSpaceUseFlows(actionHooks, state, player, targetSpace, use, resetComputeReplaceGuards(actionContext))
      if (beforeFlows.length > 0) {
        return {
          type: 'flow',
          flow: {
            type: 'seq',
            children: [...beforeFlows, targetLeaf],
          },
        }
      }
      return { type: 'flow', flow: targetLeaf }
    }

    const personChoice = choosePlacementPerson(state, player, actionHooks, sourceCard, actionContext)
    if (personChoice) return { type: 'flow', flow: personChoice }
    const person = resolvePlacementPerson({ state, player, actionContext, sourceCard })
    if (declaresPlacementPerson(actionContext)) {
      if (!person) return { type: 'fail', errorKey: 'log.placeFarmerFail' }
      person.claim?.()
    }
    const allowed = legalPlacements(state, player, actionHooks, sourceCard, actionContext, person)
    if (allowed.length === 0) return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    const options = placementOptions(state, allowed)
    return {
      type: 'request',
      request: { kind: 'choice', options },
      promptKey: 'ui.interactionPlaceFarmerExtra',
    }
  },
  resolveChoice: ({ actionHooks, state, player, sourceCard, actionContext, eventSink, completedTransactionEvents }, choice) => {
    const allowOccupied = choice.startsWith(OCCUPIED_SPACE_CHOICE_PREFIX)
    const targetSpaceId = allowOccupied
      ? choice.slice(OCCUPIED_SPACE_CHOICE_PREFIX.length)
      : choice
    const targetSpace = findActionSpaceById(state, targetSpaceId)
    if (!targetSpace) return { type: 'fail', errorKey: 'log.placeFarmerFail' }

    const person = resolvePlacementPerson({ state, player, actionContext, sourceCard })
    if (declaresPlacementPerson(actionContext) && !person) {
      return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    }
    const allowed = legalPlacements(state, player, actionHooks, sourceCard, actionContext, person)
    const allowedPlacement = allowed.find((placement) => placement.spaceId === targetSpaceId)
    if (!allowedPlacement || allowedPlacement.allowOccupied !== allowOccupied) {
      return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    }

    const placeResult = person
      ? placePerson(state, player, targetSpace, person)
      : placeFarmer(state, player, targetSpace)
    if (placeResult.type === 'fail') return placeResult
    incPlacedFarmers(player)
    writeActionSnapshotExtraData(player, 'placedWorkerId', placeResult.workerId)
    const personActionContext = person?.placed?.()
    // A Guest's use is its own, whichever card granted it; a card-supplied person keeps the card as the use's source.
    const useSourceCard = person?.ownsUse ? undefined : sourceCard
    eventSink?.emit<'worker.placed'>({
      type: 'worker.placed',
      workerId: placeResult.workerId!,
      spaceId: targetSpaceId,
      ...(useSourceCard ? { viaCardId: useSourceCard } : {}),
    })
    const actionContextWrite = {
      targetSpaceId,
      placedWorkerId: placeResult.workerId,
    }
    const targetActionContext = { ...resetComputeReplaceGuards(actionContext), ...actionContextWrite, ...personActionContext }
    if (actionContext) {
      actionContext.targetSpaceId = targetSpaceId
      actionContext.placedWorkerId = placeResult.workerId
    }
    const use = recordActionSpaceUse({ state, player, space: targetSpace, eventSink, sourceCard: useSourceCard, completedTransactionEvents }, { newPlacement: true, personUse: placeResult.personUse })
    const targetLeaf: ActionFlow = {
      type: 'leaf',
      actionId: targetSpaceId,
      spaceUse: use,
      expandFlow: true,
      sourceCard: useSourceCard,
      actionContext: targetActionContext,
    }
    const beforeFlows = collectBeforeActionSpaceUseFlows(actionHooks, state, player, targetSpace, use, targetActionContext)
    if (beforeFlows.length > 0) {
      return {
        type: 'flow',
        flow: {
          type: 'seq',
          children: [...beforeFlows, targetLeaf],
        },
        personUse: placeResult.personUse,
        extraData: { actionContextWrite },
      }
    }
    return {
      type: 'flow',
      flow: targetLeaf,
      personUse: placeResult.personUse,
      extraData: { actionContextWrite },
    }
  },
}
