import type { GameState, PlayerState } from '../../contract/types'
import type { CardDefinition } from '../../contract/cards'
import { getRegisteredMinorImprovement } from '../../cards-display/types'
import { getMajorCard } from '../major'
import { collectCardsAs } from './card-type'
import { checkCustomPrerequisite } from './prerequisite-registry'
import { fieldHasCrop } from '../../domain/field'
import { getActiveCardRegistry } from '../active-registry'

type CardPrerequisiteSource = Pick<
  CardDefinition,
  'id' | 'prerequisite' | 'occupationPrerequisites' | 'improvementPrerequisites' | 'maxRound'
>

const countOccupations = (player: PlayerState) =>
  player.occupationPlayed.length + (player.extraOccupationsFromCards?.length ?? 0)

const countAllImprovements = (player: PlayerState) =>
  player.improvements.length + player.minorPlayed.length

const countMajorImprovements = (player: PlayerState) =>
  collectCardsAs(player, 'major').length

const countCardFields = (player: PlayerState) =>
  player.minorPlayed.filter((id) => {
    const card = getRegisteredMinorImprovement(id)
    return !!card?.providesField
  }).length

const countFields = (player: PlayerState) =>
  player.fields.length + countCardFields(player)

const cardHasBaking = (cardId: string) =>
  getMajorCard(cardId)?.isBaking
  ?? getRegisteredMinorImprovement(cardId)?.isBaking
  ?? false

const cardHasCookery = (cardId: string) =>
  getMajorCard(cardId)?.isCookery
  ?? getRegisteredMinorImprovement(cardId)?.isCookery
  ?? false

const countBakingImprovements = (player: PlayerState) =>
  collectCardsAs(player, 'major').filter(cardHasBaking).length

const countCookingImprovements = (player: PlayerState) =>
  collectCardsAs(player, 'major').filter(cardHasCookery).length

const meetsNumericPrerequisite = (
  count: number,
  prerequisite?: { min?: number; max?: number },
) => {
  if (!prerequisite) return true
  if (typeof prerequisite.min === 'number' && count < prerequisite.min) {
    return false
  }
  if (typeof prerequisite.max === 'number' && count > prerequisite.max) {
    return false
  }
  return true
}

const meetsTextClause = (player: PlayerState, clause: string, state?: GameState) => {
  const trimmed = clause.trim()
  if (!trimmed) return true

  const custom = checkCustomPrerequisite(trimmed, player, state)
  if (custom !== null) return custom

  const fieldsMatch = trimmed.match(/^(\d+)\s+Fields?$/i)
  if (fieldsMatch) {
    return countFields(player) >= Number(fieldsMatch[1])
  }

  const grainFieldsMatch = trimmed.match(/^(\d+)\s+Grain Fields?$/i)
  if (grainFieldsMatch) {
    const grainFields = player.fields.filter((f) => fieldHasCrop(f, 'grain'))
    return grainFields.length >= Number(grainFieldsMatch[1])
  }

  const pastureMatch = trimmed.match(/^(\d+)\s+Pastures?$/i)
  if (pastureMatch) {
    return player.pastures.length >= Number(pastureMatch[1])
  }

  const majorImprovementsMatch = trimmed.match(/^(\d+)\s+Major Improvements?$/i)
  if (majorImprovementsMatch) {
    return countMajorImprovements(player) >= Number(majorImprovementsMatch[1])
  }

  const bakingMatch = trimmed.match(/^(\d+)\s+Baking Improvements?$/i)
  if (bakingMatch) {
    return countBakingImprovements(player) >= Number(bakingMatch[1])
  }

  if (/^Cooking Improvement$/i.test(trimmed)) {
    return countCookingImprovements(player) >= 1
  }

  if (/^No Occupations$/i.test(trimmed)) {
    return countOccupations(player) === 0
  }

  const atMostOccupationsMatch = trimmed.match(/^At Most\s+(\d+)\s+Occupations?$/i)
  if (atMostOccupationsMatch) {
    return countOccupations(player) <= Number(atMostOccupationsMatch[1])
  }

  const occupationsMatch = trimmed.match(/^(\d+)\s+Occupations?$/i)
  if (occupationsMatch) {
    return countOccupations(player) >= Number(occupationsMatch[1])
  }

  if (/^No Field Tiles$/i.test(trimmed)) {
    return countFields(player) === 0
  }

  const exactFieldTilesMatch = trimmed.match(/^Exactly\s+(\d+)\s+Field Tiles?$/i)
  if (exactFieldTilesMatch) {
    return countFields(player) === Number(exactFieldTilesMatch[1])
  }

  return true
}

const meetsTextPrerequisite = (
  player: PlayerState,
  prerequisite?: string,
  state?: GameState,
) => {
  if (!prerequisite) return true
  const trimmed = prerequisite.trim()
  if (!trimmed) return true
  // Try whole-string custom handler first (supports prereqs containing " and ").
  const customWhole = checkCustomPrerequisite(trimmed, player, state)
  if (customWhole !== null) return customWhole
  // Fall back: split on "and" and check each clause individually.
  return trimmed
    .split(/\s+and\s+/i)
    .every((clause) => meetsTextClause(player, clause, state))
}

export const meetsCardPrerequisites = (
  player: PlayerState,
  card: CardPrerequisiteSource,
  round?: number,
  state?: GameState,
) => {
  if (card.maxRound !== undefined && round !== undefined && round > card.maxRound) {
    return false
  }
  if (!meetsNumericPrerequisite(countOccupations(player), card.occupationPrerequisites)) {
    return false
  }
  if (!meetsNumericPrerequisite(countAllImprovements(player), card.improvementPrerequisites)) {
    return false
  }
  // Inline prerequisite check (registered on CardImpl) wins over declarative parser.
  const registry = getActiveCardRegistry()
  const inline = registry?.getPrerequisiteCheck(card.id)
  if (inline) return inline(player, state)
  return meetsTextPrerequisite(player, card.prerequisite, state)
}
