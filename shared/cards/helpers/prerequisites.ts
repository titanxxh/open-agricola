import type { PlayerState } from '../../game/types'
import type { CardDefinition } from '../types'
import { getMajorCardEffect } from '../major'

type CardPrerequisiteSource = Pick<
  CardDefinition,
  'prerequisite' | 'occupationPrerequisites' | 'improvementPrerequisites' | 'maxRound'
>

const countOccupations = (player: PlayerState) => player.occupationPlayed.length

const countAllImprovements = (player: PlayerState) =>
  player.improvements.length + player.minorPlayed.length

const countMajorImprovements = (player: PlayerState) => player.improvements.length

const countFields = (player: PlayerState) => player.fields.length

const countBakingImprovements = (player: PlayerState) =>
  player.improvements.filter((id) => getMajorCardEffect(id)?.isBaking).length

const countCookingImprovements = (player: PlayerState) =>
  player.improvements.filter((id) => getMajorCardEffect(id)?.isCookery).length

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

const meetsTextClause = (player: PlayerState, clause: string) => {
  const trimmed = clause.trim()
  if (!trimmed) return true

  const fieldsMatch = trimmed.match(/^(\d+)\s+Fields?$/i)
  if (fieldsMatch) {
    return countFields(player) >= Number(fieldsMatch[1])
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

const meetsTextPrerequisite = (player: PlayerState, prerequisite?: string) => {
  if (!prerequisite) return true
  return prerequisite
    .split(/\s+and\s+/i)
    .every((clause) => meetsTextClause(player, clause))
}

export const meetsCardPrerequisites = (
  player: PlayerState,
  card: CardPrerequisiteSource,
  round?: number,
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
  return meetsTextPrerequisite(player, card.prerequisite)
}
