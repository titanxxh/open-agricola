import type { EncyclopediaText, EncyclopediaTextPart, EncyclopediaTexts } from '../../shared/contract/card-encyclopedia'
import type { CardDefinition } from '../../shared/contract/cards'
import type { MoorStartCardDefinition } from '../../shared/moor/start-cards'
import type { ParentCardDefinition } from '../../shared/parents'
import {
  moorSpecialActionBuysImprovement,
  moorSpecialActionEffectGroups,
} from '../../shared/projections/moor-special-actions'
import { seasonDisplay, seasonRuleText } from '../../shared/projections/season-display'
import type { SeasonId } from '../../shared/seasons/types'
import type { MoorSpecialActionCardSource } from './sources'

const SEPARATOR = { literal: ' · ' }
const NEWLINE = { literal: '\n' }
const LIST_SEPARATOR = { key: 'ui.listSeparator' }

const joinWith = (parts: readonly EncyclopediaText[], separator: EncyclopediaTextPart): EncyclopediaText =>
  parts.flatMap((part, index) => (index === 0 ? part : [separator, ...part]))

const joinLines = (lines: readonly EncyclopediaText[]): EncyclopediaText => joinWith(lines, NEWLINE)

/** Same language-pack face fields the card face renders through `cardText`. */
export const cardTexts = (card: Pick<CardDefinition, 'id' | 'rules' | 'prerequisite'>): EncyclopediaTexts => ({
  name: [{ key: `cardFaces.${card.id}.name` }],
  body: [{ key: `cardFaces.${card.id}.description` }],
  ...(card.rules?.some((line) => line.trim()) ? { rules: [{ key: `cardFaces.${card.id}.rules` }] } : {}),
  ...(card.prerequisite?.trim() ? { prerequisite: [{ key: `cardFaces.${card.id}.prerequisite` }] } : {}),
})

export const parentTexts = (card: ParentCardDefinition): EncyclopediaTexts => ({
  name: [{ key: `ui.parentCard.${card.kind}` }, { literal: ` ${card.id}` }],
  body: card.kind === 'mother'
    ? [{ key: `parentFaces.${card.id}.text` }]
    : joinLines(([['requirement', 'requirement'], ['reward', 'reward']] as const).map(([label, field]) => [
      { key: `ui.parentCard.${label}` },
      SEPARATOR,
      ...joinWith(card.rewards.map((reward) => [{ key: `parentFaces.${card.id}.rewards.${reward.tier}.${field}` }]), { literal: ' / ' }),
    ])),
})

const playerCountText = (counts: readonly number[]): EncyclopediaText =>
  [{ key: 'moor.specialActions.players', params: { count: counts.join('/') } }]

export const moorSpecialActionTexts = (card: MoorSpecialActionCardSource): EncyclopediaTexts => ({
  name: joinWith(card.actions.map((actionId) => [{ key: `moor.specialActions.${actionId}` }]), LIST_SEPARATOR),
  body: joinLines([
    ...card.actions.flatMap((actionId) => {
      const groups = moorSpecialActionEffectGroups(actionId, card.players)
      const note: EncyclopediaText = moorSpecialActionBuysImprovement(actionId)
        ? [SEPARATOR, { key: 'moor.specialActions.improvementCost' }]
        : []
      return groups.map(({ params, playerCounts }) => [
        { key: `moor.specialActions.${actionId}` },
        ...(groups.length > 1 ? [SEPARATOR, ...playerCountText(playerCounts)] : []),
        SEPARATOR,
        { key: `moor.specialActions.effects.${actionId}`, params },
        ...note,
      ])
    }),
  ]),
})

export const moorStartTexts = (card: Pick<MoorStartCardDefinition, 'id'>): EncyclopediaTexts => {
  const number = /^moor-start-(\d+)$/.exec(card.id)?.[1]
  if (!number) throw new Error(`${card.id} has no starting terrain number`)
  return { name: [{ key: 'ui.encyclopedia.moorStart.name', params: { number: Number(number) } }] }
}

export const seasonTexts = (season: SeasonId): EncyclopediaTexts => ({
  name: [{ key: seasonDisplay[season].nameKey }],
  body: seasonRuleText(season),
})
