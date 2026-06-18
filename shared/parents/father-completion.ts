import type { EventSink } from '../contract/events'
import type { ActionChoiceOption, ActionDefinition, GameState, PlayerState, Resource } from '../contract/types'
import { addCardResourceGained, ensureCardState, writeCardInfobox } from '../cards/helpers/card-state'
import { countUnusedFarmyardSpaces } from '../domain/farm'
import { computeAnimalZones } from '../domain/animal-zones'
import { addResourcesFromCards } from '../session/stats'
import { trackWorkPhaseBuildingResources } from '../session/work-phase-resources'
import { gainResources } from '../actions/effects/gain'
import { getParentCardDefinition } from './cards'
import type { FatherParentCardId, FatherRequirement, FatherReward, FatherRewardEffect } from './types'

export const COMPLETE_PARENT_FATHER_ACTION_ID = 'complete-parent-father'
const COMPLETED_INFOBOX = 'Completed'
const COMPLETED_TIER_KEY = 'fatherCompletedTier'

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

export const satisfiedSimpleFatherRewards = (
  state: GameState,
  player: PlayerState,
): FatherReward[] => {
  if (!state.enableParentCards || state.phase !== 'playing' || state.roundPhase !== 'work') return []
  const fatherId = player.parentCards.father
  if (!fatherId || isFatherCompleted(player, fatherId)) return []
  const definition = getParentCardDefinition(fatherId)
  if (!definition || definition.kind !== 'father') return []
  return definition.rewards.filter((reward) =>
    isSimpleFatherReward(reward) &&
    isFatherRequirementSatisfied(state, player, reward.requirement),
  )
}

const optionForReward = (fatherId: FatherParentCardId, reward: FatherReward): ActionChoiceOption => ({
  value: `${fatherId}:${reward.tier}`,
  labelKey: 'ui.cards.parentFatherComplete.tier',
  labelParams: {
    tier: reward.tier,
    requirement: reward.requirementText,
    reward: reward.rewardText,
  },
  sourceCard: fatherId,
})

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
    satisfiedSimpleFatherRewards(state, player).length > 0,
  execute: ({ state, player }) => {
    const fatherId = player.parentCards.father
    if (!fatherId) return { type: 'fail', errorKey: 'log.actionUnavailable' }
    const options = satisfiedSimpleFatherRewards(state, player).map((reward) => optionForReward(fatherId, reward))
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
    const reward = satisfiedSimpleFatherRewards(state, player).find((candidate) => candidate.tier === tier)
    if (!reward) return { type: 'fail', errorKey: 'log.actionUnavailable' }
    if (applyFatherReward(state, player, fatherId, reward, eventSink) === null) {
      return { type: 'fail', errorKey: 'log.actionUnavailable' }
    }
    markFatherCompleted(player, fatherId, reward.tier, eventSink)
    return { type: 'ok' }
  },
}
