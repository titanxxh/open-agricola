import type { ActionChoiceOption, ActionDefinition, ActionExecutionResult, ActionFlow, ChoiceEffectPreview, GameState, OrdinaryCardType, PlayerState, Resource } from '../contract/types'
import { animalKeysForState, type AnimalKey } from '../contract/animals'
import { countUnusedFarmyardSpaces } from '../domain/farm'
import { computeAnimalZones } from '../domain/animal-zones'
import { buildSowFarmInteraction } from '../domain/farmyard'
import { startOrdinaryCardDrawChoice } from '../session/ordinary-card-draw'
import { getParentCardDefinition } from './cards'
import type { FatherParentCardId, FatherRequirement, FatherReward, FatherRewardEffect } from './types'

export const COMPLETE_PARENT_FATHER_ACTION_ID = 'complete-parent-father'
const COMPLETED_INFOBOX = 'Completed'
const COMPLETED_TIER_KEY = 'fatherCompletedTier'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const
type BuildingResource = typeof BUILDING_RESOURCES[number]

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

const animalCounts = (state: GameState, player: PlayerState): Partial<Record<AnimalKey, number>> => {
  const allowed = new Set(animalKeysForState(state))
  const counts: Partial<Record<AnimalKey, number>> = {}
  for (const zone of computeAnimalZones(player, state)) {
    if (zone.blocked) continue
    const type = zone.animalType
    const count = zone.animalCount ?? 0
    if (type && allowed.has(type) && count > 0) {
      counts[type] = (counts[type] ?? 0) + count
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
      return (counts[requirement.animal] ?? 0) >= requirement.amount
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

const resourceCombinations = (count: number): BuildingResource[][] => {
  if (!Number.isInteger(count) || count <= 0 || count > BUILDING_RESOURCES.length) return []
  const out: BuildingResource[][] = []
  const visit = (start: number, current: BuildingResource[]) => {
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

const optionForReward = (
  fatherId: FatherParentCardId,
  reward: FatherReward,
  suffix?: string,
  rewardLabel = reward.rewardText,
  effectPreview?: ChoiceEffectPreview,
  previewRewardLabel = rewardLabel,
): ActionChoiceOption => {
  const labelParams = {
    tier: reward.tier,
    requirement: reward.requirementText,
    reward: rewardLabel,
  }
  const previewLabelParams = {
    ...labelParams,
    reward: previewRewardLabel,
  }
  return {
    value: suffix ? `${fatherId}:${reward.tier}:${suffix}` : `${fatherId}:${reward.tier}`,
    labelKey: 'ui.cards.parentFatherComplete.tier',
    labelParams,
    sourceCard: fatherId,
    descriptionPreview: effectPreview
      ? {
          kind: 'action',
          labelKey: 'ui.cards.parentFatherComplete.tier',
          labelParams: previewLabelParams,
          effectPreview,
        }
      : undefined,
  }
}

const resourceGainPreview = (
  resources: Partial<Resource>,
  bonusVp = 0,
): ChoiceEffectPreview | undefined => {
  const resourcesGained = positiveResources(resources)
  if (Object.keys(resourcesGained).length === 0 && bonusVp <= 0) return undefined
  return {
    kind: 'resourceExchange',
    resourcesGained: Object.keys(resourcesGained).length > 0 ? resourcesGained : undefined,
    bonusVp: bonusVp > 0 ? bonusVp : undefined,
  }
}

const simpleRewardPreview = (reward: FatherReward): ChoiceEffectPreview | undefined => {
  if (!isSimpleFatherReward(reward)) return undefined
  const resources: Partial<Resource> = {}
  let bonusVp = 0
  for (const effect of reward.effects) {
    if (effect.type === 'gain-resources') {
      for (const [key, value] of Object.entries(positiveResources(effect.resources))) {
        resources[key as keyof Resource] = (resources[key as keyof Resource] ?? 0) + value
      }
    } else if (effect.type === 'bonus-points') {
      bonusVp += effect.amount
    }
  }
  return resourceGainPreview(resources, bonusVp)
}

const optionsForReward = (
  player: PlayerState,
  fatherId: FatherParentCardId,
  reward: FatherReward,
): FatherCompletionOption[] => {
  const houseMaterial = houseMaterialReward(reward)
  if (houseMaterial !== null) {
    return [{
      option: optionForReward(
        fatherId,
        reward,
        undefined,
        reward.rewardText,
        resourceGainPreview({ [player.houseType]: houseMaterial }),
      ),
      reward,
    }]
  }
  const chooseCount = chooseBuildingResourceCount(reward)
  if (chooseCount !== null) {
    return resourceCombinations(chooseCount).map((resources) => ({
      option: optionForReward(
        fatherId,
        reward,
        resources.join(','),
        `${reward.rewardText} (${resources.join(' + ')})`,
        resourceGainPreview(Object.fromEntries(resources.map((resource) => [resource, 1])) as Partial<Resource>),
        reward.rewardText,
      ),
      reward,
    }))
  }
  return [{ option: optionForReward(fatherId, reward, undefined, reward.rewardText, simpleRewardPreview(reward)), reward }]
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
    .flatMap((reward) => optionsForReward(player, fatherId, reward))
}

export const satisfiedSimpleFatherRewards = (
  state: GameState,
  player: PlayerState,
): FatherReward[] =>
  satisfiedFatherCompletionOptions(state, player)
    .map((entry) => entry.reward)
    .filter((reward, index, rewards) => rewards.findIndex((candidate) => candidate.tier === reward.tier) === index)

const completionMarkerSteps = (
  fatherId: FatherParentCardId,
  tier: FatherReward['tier'],
): ActionFlow[] => [
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
]

const gainFlow = (
  fatherId: FatherParentCardId,
  resources: Partial<Resource>,
): ActionFlow | null => {
  const gained = positiveResources(resources)
  if (Object.keys(gained).length === 0) return null
  return {
    type: 'leaf',
    actionId: 'gain',
    sourceCard: fatherId,
    params: gained,
  }
}

const rewardEffectSteps = (
  fatherId: FatherParentCardId,
  reward: FatherReward,
): ActionFlow[] | null => {
  const children: ActionFlow[] = []
  for (const effect of reward.effects) {
    if (effect.type === 'gain-resources') {
      const flow = gainFlow(fatherId, effect.resources)
      if (flow) children.push(flow)
    } else if (effect.type === 'bonus-points') {
      if (effect.amount > 0) {
        children.push({
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: fatherId,
          params: { kind: 'increment-counter', key: 'bonusVp', amount: effect.amount },
        })
      }
    } else {
      return null
    }
  }
  return children
}

const completedRewardFlow = (
  fatherId: FatherParentCardId,
  reward: FatherReward,
  steps: ActionFlow[],
): ActionFlow => ({
  type: 'seq',
  children: [
    ...steps,
    ...completionMarkerSteps(fatherId, reward.tier),
  ],
})

const simpleFatherRewardFlow = (
  fatherId: FatherParentCardId,
  reward: FatherReward,
): ActionFlow | null => {
  const steps = rewardEffectSteps(fatherId, reward)
  if (!steps) return null
  return completedRewardFlow(fatherId, reward, steps)
}

const applyComplexFatherReward = (
  state: GameState,
  player: PlayerState,
  fatherId: FatherParentCardId,
  reward: FatherReward,
  choice: string,
): ActionExecutionResult | null => {
  const houseMaterial = houseMaterialReward(reward)
  if (houseMaterial !== null) {
    const flow = gainFlow(fatherId, { [player.houseType]: houseMaterial })
    if (!flow) return null
    return { type: 'flow', flow: completedRewardFlow(fatherId, reward, [flow]) }
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
    return { type: 'flow', flow: completedRewardFlow(fatherId, reward, []) }
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
    const flow = gainFlow(fatherId, gained)
    if (!flow) return null
    return { type: 'flow', flow: completedRewardFlow(fatherId, reward, [flow]) }
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
            actionContext: { maxSelections, minSelections: 1, trueAction: false },
          },
          ...completionMarkerSteps(fatherId, reward.tier),
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
  resolveChoice: ({ state, player }, choice) => {
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
    const simple = simpleFatherRewardFlow(fatherId, selected.reward)
    if (simple) return { type: 'flow', flow: simple }
    const complex = applyComplexFatherReward(state, player, fatherId, selected.reward, choice)
    if (complex === null) {
      return { type: 'fail', errorKey: 'log.actionUnavailable' }
    }
    return complex
  },
}
