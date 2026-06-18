import type { EventSink } from '../contract/events'
import type { ActionChoiceOption, ActionDefinition, ActionExecutionResult, ActionFlow, GameState, OrdinaryCardType, PlayerState, Resource } from '../contract/types'
import { addCardResourceGained, ensureCardState, writeCardInfobox } from '../cards/helpers/card-state'
import { countUnusedFarmyardSpaces } from '../domain/farm'
import { computeAnimalZones } from '../domain/animal-zones'
import { addResourcesFromCards } from '../session/stats'
import { trackWorkPhaseBuildingResources } from '../session/work-phase-resources'
import { gainResources } from '../actions/effects/gain'
import { buildSowFarmInteraction } from '../domain/farmyard'
import { startOrdinaryCardDrawChoice } from '../session/ordinary-card-draw'
import { getParentCardDefinition } from './cards'
import type { FatherParentCardId, FatherRequirement, FatherReward, FatherRewardEffect } from './types'

export const COMPLETE_PARENT_FATHER_ACTION_ID = 'complete-parent-father'
const COMPLETED_INFOBOX = 'Completed'
const COMPLETED_TIER_KEY = 'fatherCompletedTier'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const positiveResources = (resources: Partial<Resource>): Partial<Resource> => {
  const out: Partial<Resource> = {}
  for (const [key, value] of Object.entries(resources)) {
    if (typeof value === 'number' && value > 0) {
      out[key as keyof Resource] = value
    }
  }
  return out
}

const countPlayedCards = (
  player: PlayerState,
  requirement: Extract<FatherRequirement, { type: 'played-card-at-least' }>,
): number => {
  switch (requirement.cardType) {
    case 'occupation':
      return player.occupationPlayed.length
    case 'minor-improvement':
      return player.minorPlayed.length
    case 'major-improvement':
      return player.improvements.length
    case 'improvement':
      return player.minorPlayed.length + player.improvements.length
    default:
      return 0
  }
}

const totalCardsIncludingParents = (player: PlayerState): number =>
  player.occupationPlayed.length +
  player.minorPlayed.length +
  player.improvements.length +
  (player.parentCards.mother ? 1 : 0) +
  (player.parentCards.father ? 1 : 0)

const animalCounts = (state: GameState, player: PlayerState): Record<'sheep' | 'boar' | 'cattle', number> => {
  const counts = { sheep: 0, boar: 0, cattle: 0 }
  for (const zone of computeAnimalZones(player, state)) {
    if (zone.blocked) continue
    const type = zone.animalType
    const count = zone.animalCount ?? 0
    if ((type === 'sheep' || type === 'boar' || type === 'cattle') && count > 0) {
      counts[type] += count
    }
  }
  return counts
}

const manualRequirementSatisfied = (
  state: GameState,
  player: PlayerState,
  key: string,
): boolean => {
  const totalCards = key.match(/^total-cards-in-play-including-parents-at-least-(\d+)$/)
  if (totalCards) return totalCardsIncludingParents(player) >= Number(totalCards[1])

  const unusedSpaces = key.match(/^unused-farmyard-spaces-at-most-(\d+)$/)
  if (unusedSpaces) return countUnusedFarmyardSpaces(player) <= Number(unusedSpaces[1])

  const animalTypes = key.match(/^animal-type-count-at-least-(\d+)$/)
  if (animalTypes) {
    const required = Number(animalTypes[1])
    return Object.values(animalCounts(state, player)).filter((count) => count > 0).length >= required
  }

  const sameAnimal = key.match(/^same-animal-type-at-least-(\d+)$/)
  if (sameAnimal) {
    const required = Number(sameAnimal[1])
    return Object.values(animalCounts(state, player)).some((count) => count >= required)
  }

  return false
}

export const isFatherRequirementSatisfied = (
  state: GameState,
  player: PlayerState,
  requirement: FatherRequirement,
): boolean => {
  switch (requirement.type) {
    case 'resource-at-least':
      return (player.resources[requirement.resource] ?? 0) >= requirement.amount
    case 'animal-at-least': {
      const counts = animalCounts(state, player)
      if (requirement.animal === 'any') {
        return Object.values(counts).reduce((sum, count) => sum + count, 0) >= requirement.amount
      }
      return counts[requirement.animal] >= requirement.amount
    }
    case 'farm-count-at-least':
      switch (requirement.target) {
        case 'room':
          return player.rooms >= requirement.amount
        case 'field':
          return player.fields.length >= requirement.amount
        case 'pasture':
          return player.pastures.length >= requirement.amount
        case 'stable':
          return player.stableTiles.length >= requirement.amount
        case 'fenced-stable':
          return player.pastures.reduce((sum, pasture) => sum + pasture.stables, 0) >= requirement.amount
        case 'family-member':
          return player.workers.filter((worker) => worker.isActive).length >= requirement.amount
        case 'fence':
          return player.fenceSegments.filter((segment) => segment.type === 'fence').length >= requirement.amount
        case 'empty-space':
          return countUnusedFarmyardSpaces(player) >= requirement.amount
      }
      return false
    case 'played-card-at-least':
      return countPlayedCards(player, requirement) >= requirement.amount
    case 'all':
      return requirement.requirements.every((child) => isFatherRequirementSatisfied(state, player, child))
    case 'any':
      return requirement.requirements.some((child) => isFatherRequirementSatisfied(state, player, child))
    case 'manual':
      return manualRequirementSatisfied(state, player, requirement.key)
  }
}

const isSimpleFatherRewardEffect = (effect: FatherRewardEffect): boolean =>
  effect.type === 'gain-resources' || effect.type === 'bonus-points'

const isSimpleFatherReward = (reward: FatherReward): boolean =>
  reward.effects.length > 0 && reward.effects.every(isSimpleFatherRewardEffect)

const isFatherCompleted = (player: PlayerState, fatherId: FatherParentCardId): boolean =>
  typeof player.cardStates?.[fatherId]?.extraData?.[COMPLETED_TIER_KEY] === 'number'

type FatherCompletionOption = {
  option: ActionChoiceOption
  reward: FatherReward
}

const singleManualKey = (reward: FatherReward): string | null =>
  reward.effects.length === 1 && reward.effects[0]?.type === 'manual'
    ? reward.effects[0].key
    : null

const houseMaterialReward = (reward: FatherReward): number | null => {
  const match = singleManualKey(reward)?.match(/^gain-house-material-(\d+)$/)
  return match ? Number(match[1]) : null
}

const drawTypesForReward = (reward: FatherReward): OrdinaryCardType[] | null => {
  switch (singleManualKey(reward)) {
    case 'draw-3-minor-improvements-keep-1':
      return ['minor']
    case 'draw-3-occupations-keep-1':
      return ['occupation']
    case 'draw-3-minor-improvements-and-3-occupations-keep-1-each':
      return ['minor', 'occupation']
    default:
      return null
  }
}

const chooseBuildingResourceCount = (reward: FatherReward): number | null => {
  const match = singleManualKey(reward)?.match(/^choose-(\d+)-different-building-resources?$/)
  return match ? Number(match[1]) : null
}

const sowFieldLimit = (reward: FatherReward): number | null => {
  const match = singleManualKey(reward)?.match(/^sow-up-to-(\d+)-fields?-single-sow-action$/)
  return match ? Number(match[1]) : null
}

const drawDecksAvailable = (state: GameState, reward: FatherReward): boolean => {
  const drawTypes = drawTypesForReward(reward)
  return drawTypes !== null && drawTypes.every((cardType) => state.ordinaryCardDecks[cardType].length >= 3)
}

const canResolveSowReward = (player: PlayerState, reward: FatherReward): boolean => {
  const maxSelections = sowFieldLimit(reward)
  if (maxSelections === null) return false
  const farm = buildSowFarmInteraction(player, { maxSelections, minSelections: 1 })
  return farm.farmType === 'sow' && farm.selectableFields.length > 0
}

const resourceCombinations = (count: number): string[][] => {
  if (!Number.isInteger(count) || count <= 0 || count > BUILDING_RESOURCES.length) return []
  const out: string[][] = []
  const visit = (start: number, current: string[]) => {
    if (current.length === count) {
      out.push([...current])
      return
    }
    for (let i = start; i < BUILDING_RESOURCES.length; i += 1) {
      current.push(BUILDING_RESOURCES[i]!)
      visit(i + 1, current)
      current.pop()
    }
  }
  visit(0, [])
  return out
}

const isSupportedFatherReward = (state: GameState, player: PlayerState, reward: FatherReward): boolean => {
  if (isSimpleFatherReward(reward)) return true
  if (houseMaterialReward(reward) !== null) return true
  if (drawTypesForReward(reward) !== null) return drawDecksAvailable(state, reward)
  if (chooseBuildingResourceCount(reward) !== null) return true
  if (sowFieldLimit(reward) !== null) return canResolveSowReward(player, reward)
  return false
}

const optionForReward = (fatherId: FatherParentCardId, reward: FatherReward, suffix?: string): ActionChoiceOption => ({
  value: suffix ? `${fatherId}:${reward.tier}:${suffix}` : `${fatherId}:${reward.tier}`,
  labelKey: 'ui.cards.parentFatherComplete.tier',
  labelParams: {
    tier: reward.tier,
    requirement: reward.requirementText,
    reward: reward.rewardText,
  },
  sourceCard: fatherId,
})

const optionsForReward = (
  fatherId: FatherParentCardId,
  reward: FatherReward,
): FatherCompletionOption[] => {
  const chooseCount = chooseBuildingResourceCount(reward)
  if (chooseCount !== null) {
    return resourceCombinations(chooseCount).map((resources) => ({
      option: optionForReward(fatherId, reward, resources.join(',')),
      reward,
    }))
  }
  return [{ option: optionForReward(fatherId, reward), reward }]
}

export const satisfiedFatherCompletionOptions = (
  state: GameState,
  player: PlayerState,
): FatherCompletionOption[] => {
  if (!state.enableParentCards || state.phase !== 'playing' || state.roundPhase !== 'work') return []
  const fatherId = player.parentCards.father
  if (!fatherId || isFatherCompleted(player, fatherId)) return []
  const definition = getParentCardDefinition(fatherId)
  if (!definition || definition.kind !== 'father') return []
  return definition.rewards
    .filter((reward) =>
      isSupportedFatherReward(state, player, reward) &&
      isFatherRequirementSatisfied(state, player, reward.requirement),
    )
    .flatMap((reward) => optionsForReward(fatherId, reward))
}

export const satisfiedSimpleFatherRewards = (
  state: GameState,
  player: PlayerState,
): FatherReward[] =>
  satisfiedFatherCompletionOptions(state, player)
    .map((entry) => entry.reward)
    .filter((reward, index, rewards) => rewards.findIndex((candidate) => candidate.tier === reward.tier) === index)

const emitGainEvent = (
  eventSink: EventSink | undefined,
  player: PlayerState,
  fatherId: FatherParentCardId,
  resources: Partial<Resource>,
): void => {
  const gained = positiveResources(resources)
  if (Object.keys(gained).length === 0) return
  eventSink?.emit<'resource.moved'>({
    type: 'resource.moved',
    resources: gained,
    from: { kind: 'card', playerId: player.id, cardId: fatherId },
    to: { kind: 'player', playerId: player.id },
    reason: 'cardEffect',
    sourceCardId: fatherId,
  })
}

const applyFatherReward = (
  state: GameState,
  player: PlayerState,
  fatherId: FatherParentCardId,
  reward: FatherReward,
  eventSink: EventSink,
): Partial<Resource> | null => {
  const gained: Partial<Resource> = {}
  for (const effect of reward.effects) {
    if (effect.type === 'gain-resources') {
      gainResources(player, effect.resources)
      for (const [key, value] of Object.entries(effect.resources)) {
        if (typeof value === 'number' && value > 0) {
          const resource = key as keyof Resource
          gained[resource] = (gained[resource] ?? 0) + value
        }
      }
    } else if (effect.type === 'bonus-points') {
      const cardState = ensureCardState(player, fatherId)
      cardState.counters = { ...(cardState.counters ?? {}) }
      cardState.counters.bonusVp = (cardState.counters.bonusVp ?? 0) + effect.amount
      eventSink.emit<'card.stateChanged'>({
        type: 'card.stateChanged',
        sourceCardId: fatherId,
        cardId: fatherId,
        key: 'bonusVp',
        value: cardState.counters.bonusVp,
        targetPlayerId: player.id,
      })
    } else {
      return null
    }
  }
  emitGainEvent(eventSink, player, fatherId, gained)
  addResourcesFromCards(player, gained)
  addCardResourceGained(player, fatherId, gained)
  trackWorkPhaseBuildingResources(state, player.id, gained)
  return gained
}

const gainAndTrackFatherResources = (
  state: GameState,
  player: PlayerState,
  fatherId: FatherParentCardId,
  resources: Partial<Resource>,
  eventSink: EventSink,
): void => {
  gainResources(player, resources)
  emitGainEvent(eventSink, player, fatherId, resources)
  addResourcesFromCards(player, resources)
  addCardResourceGained(player, fatherId, resources)
  trackWorkPhaseBuildingResources(state, player.id, resources)
}

const markFatherCompleted = (
  player: PlayerState,
  fatherId: FatherParentCardId,
  tier: FatherReward['tier'],
  eventSink: EventSink,
): void => {
  const cardState = ensureCardState(player, fatherId)
  cardState.extraData = { ...(cardState.extraData ?? {}), [COMPLETED_TIER_KEY]: tier }
  writeCardInfobox(player, fatherId, COMPLETED_INFOBOX)
  eventSink.emit<'card.stateChanged'>({
    type: 'card.stateChanged',
    sourceCardId: fatherId,
    cardId: fatherId,
    key: COMPLETED_TIER_KEY,
    value: tier,
    targetPlayerId: player.id,
  })
  eventSink.emit<'card.infoboxChanged'>({
    type: 'card.infoboxChanged',
    sourceCardId: fatherId,
    cardId: fatherId,
    text: COMPLETED_INFOBOX,
    targetPlayerId: player.id,
  })
}

const completionMarkerFlow = (
  fatherId: FatherParentCardId,
  tier: FatherReward['tier'],
): ActionFlow => ({
  type: 'seq',
  children: [
    {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: fatherId,
      params: { kind: 'set-extra-data', key: COMPLETED_TIER_KEY, value: tier },
    },
    {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: fatherId,
      params: { kind: 'set-infobox', text: COMPLETED_INFOBOX },
    },
  ],
})

const applyComplexFatherReward = (
  state: GameState,
  player: PlayerState,
  fatherId: FatherParentCardId,
  reward: FatherReward,
  choice: string,
  eventSink: EventSink,
): ActionExecutionResult | null => {
  const houseMaterial = houseMaterialReward(reward)
  if (houseMaterial !== null) {
    gainAndTrackFatherResources(state, player, fatherId, { [player.houseType]: houseMaterial }, eventSink)
    markFatherCompleted(player, fatherId, reward.tier, eventSink)
    return { type: 'ok' }
  }

  const drawTypes = drawTypesForReward(reward)
  if (drawTypes !== null) {
    if (!drawTypes.every((cardType) => state.ordinaryCardDecks[cardType].length >= 3)) {
      return { type: 'fail', errorKey: 'log.actionUnavailable' }
    }
    for (const cardType of drawTypes) {
      const started = startOrdinaryCardDrawChoice(state, {
        playerId: player.id,
        cardType,
        count: 3,
        sourceCard: fatherId,
        sourceActionId: COMPLETE_PARENT_FATHER_ACTION_ID,
      })
      if (!started.ok) return { type: 'fail', errorKey: 'log.actionUnavailable' }
    }
    markFatherCompleted(player, fatherId, reward.tier, eventSink)
    return { type: 'ok' }
  }

  const chooseCount = chooseBuildingResourceCount(reward)
  if (chooseCount !== null) {
    const resources = choice.split(':')[2]?.split(',').filter(Boolean) ?? []
    if (
      resources.length !== chooseCount ||
      new Set(resources).size !== resources.length ||
      !resources.every((resource): resource is typeof BUILDING_RESOURCES[number] =>
        (BUILDING_RESOURCES as readonly string[]).includes(resource),
      )
    ) {
      return { type: 'fail', errorKey: 'log.actionUnavailable' }
    }
    const gained = Object.fromEntries(resources.map((resource) => [resource, 1])) as Partial<Resource>
    gainAndTrackFatherResources(state, player, fatherId, gained, eventSink)
    markFatherCompleted(player, fatherId, reward.tier, eventSink)
    return { type: 'ok' }
  }

  const maxSelections = sowFieldLimit(reward)
  if (maxSelections !== null) {
    if (!canResolveSowReward(player, reward)) return { type: 'fail', errorKey: 'log.actionUnavailable' }
    return {
      type: 'flow',
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'sow',
            sourceCard: fatherId,
            actionContext: { maxSelections, minSelections: 1 },
          },
          completionMarkerFlow(fatherId, reward.tier),
        ],
      },
    }
  }

  return null
}

export const completeParentFatherAction: ActionDefinition = {
  id: COMPLETE_PARENT_FATHER_ACTION_ID,
  nameKey: 'actions.complete-parent-father.name',
  descriptionKey: 'actions.complete-parent-father.description',
  roundAvailable: 1,
  gainPerRound: {},
  anytime: true,
  idleOnly: true,
  canBeExecutedByPlayer: (state, player) =>
    state.currentPlayerIndex === state.players.indexOf(player) &&
    satisfiedFatherCompletionOptions(state, player).length > 0,
  execute: ({ state, player }) => {
    const fatherId = player.parentCards.father
    if (!fatherId) return { type: 'fail', errorKey: 'log.actionUnavailable' }
    const options = satisfiedFatherCompletionOptions(state, player).map((entry) => entry.option)
    if (options.length === 0) return { type: 'fail', errorKey: 'log.actionUnavailable' }
    return {
      type: 'request',
      request: { kind: 'choice', options },
      promptKey: 'ui.cards.parentFatherComplete.prompt',
      sourceCard: fatherId,
    }
  },
  resolveChoice: ({ state, player, eventSink }, choice) => {
    const fatherId = player.parentCards.father
    if (!fatherId) return { type: 'fail', errorKey: 'log.actionUnavailable' }
    const [choiceFatherId, tierText] = choice.split(':')
    const tier = Number(tierText)
    if (choiceFatherId !== fatherId || (tier !== 1 && tier !== 2 && tier !== 3)) {
      return { type: 'fail', errorKey: 'log.actionUnavailable' }
    }
    const offered = satisfiedFatherCompletionOptions(state, player)
    const selected = offered.find((entry) => entry.option.value === choice)
    if (!selected || selected.reward.tier !== tier) return { type: 'fail', errorKey: 'log.actionUnavailable' }
    const simple = applyFatherReward(state, player, fatherId, selected.reward, eventSink)
    if (simple !== null) {
      markFatherCompleted(player, fatherId, selected.reward.tier, eventSink)
      return { type: 'ok' }
    }
    const complex = applyComplexFatherReward(state, player, fatherId, selected.reward, choice, eventSink)
    if (complex === null) {
      return { type: 'fail', errorKey: 'log.actionUnavailable' }
    }
    return complex
  },
}
