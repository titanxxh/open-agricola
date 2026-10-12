import type { ActionExecutionContext, ActionMutationContext, ActionExecutionResult, ActionFlow, Resource } from '../contract/types'
import { extendedResourceKeyList } from '../contract/state-constants'
import type { RuleActivatedOperation } from '../contract/rule-activated-operations'
import { readCardExtraData, writeCardExtraData } from '../cards/helpers/card-state'
import { getStoredResource } from '../cards/helpers/card-storage'
import { supplyWorkerTurnFlow, consumeSupplyWorkerTurn } from '../cards/helpers/supply-worker-flow'
import { releaseSupplyWorker } from '../domain/supply-workers'
import { hasInactiveWorkerInSupply } from '../domain/player'

export const planMoveWorkerFromSpace = (
  operation: Extract<RuleActivatedOperation, { kind: 'move-worker-from-space' }>,
  context: Pick<ActionExecutionContext, 'state' | 'player' | 'sourceCard'>,
): Extract<ActionFlow, { type: 'leaf' }> | undefined => {
  const worker = context.state.actionSpaces.find(space => space.id === operation.spaceId)?.takenBy.find(entry => entry.playerId === context.player.id)
  return worker ? { type: 'leaf', actionId: 'move-farmer-to-space', sourceCard: context.sourceCard,
    params: { excludeSpaceId: operation.spaceId, workerId: worker.workerId },
    actionContext: { moveFarmerSourceSpaceId: operation.spaceId, moveFarmerWorkerId: worker.workerId },
  } : undefined
}

export const executeActivatedRuleOperation = (operation: RuleActivatedOperation, context: ActionMutationContext): ActionExecutionResult => {
  const { state, player, sourceCard } = context
  if (!sourceCard) return { type: 'fail', errorKey: 'log.cardEffectFail' }
  switch (operation.kind) {
    case 'supply-worker-turn': return hasInactiveWorkerInSupply(player) ? { type: 'flow', flow: supplyWorkerTurnFlow(state, player, sourceCard, [consumeSupplyWorkerTurn(sourceCard)]) } : { type: 'ok' }
    case 'release-reserved-worker': {
      const workerId = readCardExtraData<unknown>(player, sourceCard, operation.workerFact)
      const worker = player.workers.find(entry => entry.id === workerId)
      if (worker?.supplyUse?.sourceCard === sourceCard) releaseSupplyWorker(state, player, worker)
      writeCardExtraData(player, sourceCard, operation.workerFact, undefined)
      return { type: 'ok' }
    }
    case 'gain-per-building-resource-collected': {
      const count = context.params?.buildingResourceCount
      return typeof count === 'number' && count > 0 ? { type: 'flow', flow: {
        type: 'leaf', actionId: 'gain', sourceCard, params: { [operation.resource]: count * operation.perBuildingResource },
      } } : { type: 'ok' }
    }
    case 'skip-next-turns': return { type: 'ok' }
    case 'put-on-action-space': {
      const space = state.actionSpaces.find(entry => entry.id === operation.spaceId)
      const single = context.params?.singleOccurrence === true
      const raw = operation.occurrencesFact && !single ? readCardExtraData<unknown>(player, sourceCard, operation.occurrencesFact) : 1
      const occurrences = typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 0
      if (operation.occurrencesFact && !single) {
        writeCardExtraData(player, sourceCard, operation.occurrencesFact, 0)
        return occurrences > 0 ? { type: 'flow', flow: {
          type: 'seq', sourceCard, children: Array.from({ length: occurrences }, () => ({
            type: 'leaf', actionId: 'rule-operation', sourceCard, params: { ...context.params, singleOccurrence: true },
          })),
        } } : { type: 'ok' }
      }
      const resources: Partial<Resource> = {}
      if (space) for (const resource of extendedResourceKeyList) {
        const amount = operation.resources[resource]
        if (typeof amount === 'number' && amount > 0 && occurrences > 0) {
          resources[resource] = amount * occurrences
          space.resources[resource] = (space.resources[resource] ?? 0) + amount * occurrences
        }
      }
      if (space && Object.keys(resources).length) context.eventSink?.emit<'resource.moved'>({
        type: 'resource.moved', resources, from: { kind: 'supply' }, to: { kind: 'actionSpace', spaceId: operation.spaceId },
        reason: 'cardEffect', sourceCardId: sourceCard,
      })
      return { type: 'ok' }
    }
    case 'supply-worker-placement': return hasInactiveWorkerInSupply(player) ? { type: 'flow', flow: {
      type: 'leaf', actionId: 'place-farmer', sourceCard,
      actionContext: { trueAction: false, extraPlacement: true, workerSource: { kind: 'supply', disposition: 'return-to-supply' } },
    } } : { type: 'ok' }
    case 'move-worker-from-space': {
      const flow = planMoveWorkerFromSpace(operation, context)
      return flow ? { type: 'flow', flow } : { type: 'ok' }
    }
    case 'card-fact-refund': {
      const raw = readCardExtraData<unknown>(player, sourceCard, operation.fact)
      const amount = typeof raw === 'number' ? Math.floor(raw / operation.divisor) : 0
      writeCardExtraData(player, sourceCard, operation.fact, 0)
      return amount > 0 ? { type: 'flow', flow: { type: 'leaf', actionId: 'gain', sourceCard, params: { [operation.resource]: amount } } } : { type: 'ok' }
    }
    case 'harvest-selected-supply-reward': {
      const raw = readCardExtraData<unknown>(player, sourceCard, operation.selectionFact)
      const selected = new Set(Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : [])
      const applications = state.harvestReapSummary?.[player.id]?.harvestCountApplications ?? []
      const counted = new Set(applications.filter(application => application.crop === operation.crop
        && selected.has(`${application.row}-${application.col}`)
        && application.tags.includes(operation.applicationTag)
        && !application.tags.includes(operation.excludedTag)).map(application => `${application.row}-${application.col}`))
      writeCardExtraData(player, sourceCard, operation.selectionFact, undefined)
      return counted.size > 0 ? { type: 'flow', flow: { type: 'leaf', actionId: 'gain', sourceCard, params: { [operation.crop]: counted.size } } } : { type: 'ok' }
    }
    case 'take-stored-resources': {
      const children: ActionFlow[] = operation.resources.flatMap(resource => {
        const amount = getStoredResource(player, sourceCard, resource)
        return amount > 0 ? [{ type: 'leaf', actionId: 'take-from-card', sourceCard, params: { [resource]: amount } }] : []
      })
      return children.length ? { type: 'flow', flow: { type: 'seq', children } } : { type: 'ok' }
    }
  }
}

export const consumePlannedTurnSkip = (player: ActionExecutionContext['player'], sourceCard: string, operation: Extract<RuleActivatedOperation, { kind: 'skip-next-turns' }>): boolean => {
  const remaining = readCardExtraData<unknown>(player, sourceCard, operation.countFact)
  if (typeof remaining !== 'number' || remaining <= 0) return false
  writeCardExtraData(player, sourceCard, operation.countFact, remaining > 1 ? remaining - 1 : undefined)
  return true
}
