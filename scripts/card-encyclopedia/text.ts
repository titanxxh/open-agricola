import type { EncyclopediaText, EncyclopediaTexts } from '../../shared/contract/card-encyclopedia'
import type { CardDefinition } from '../../shared/contract/cards'
import type { ParentCardDefinition } from '../../shared/parents'
import {
  moorSpecialActionBuysImprovement,
  moorSpecialActionEffectParams,
} from '../../shared/projections/moor-special-actions'
import { seasonDisplay, seasonRuleText } from '../../shared/projections/season-display'
import type { SeasonId } from '../../shared/seasons/types'
import type { MoorSpecialActionCardSource } from './sources'

const SEPARATOR = { literal: ' · ' }
const NEWLINE = { literal: '\n' }

const joinLines = (lines: readonly EncyclopediaText[]): EncyclopediaText =>
  lines.flatMap((line, index) => (index === 0 ? line : [NEWLINE, ...line]))

const joinWith = (parts: readonly EncyclopediaText[], separator: string): EncyclopediaText =>
  parts.flatMap((part, index) => (index === 0 ? part : [{ literal: separator }, ...part]))

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
      ...joinWith(card.rewards.map((reward) => [{ key: `parentFaces.${card.id}.rewards.${reward.tier}.${field}` }]), ' / '),
    ])),
})

const playerCountText = (counts: readonly number[]): EncyclopediaText =>
  [{ key: 'moor.specialActions.players', params: { count: counts.join('/') } }]

export const moorSpecialActionTexts = (card: MoorSpecialActionCardSource): EncyclopediaTexts => ({
  name: joinWith(card.actions.map((actionId) => [{ key: `moor.specialActions.${actionId}` }]), ' / '),
  body: joinLines([
    playerCountText(card.players),
    ...card.actions.flatMap((actionId) => {
      const byEffect = new Map<string, { params: ReturnType<typeof moorSpecialActionEffectParams>; counts: number[] }>()
      for (const count of card.players) {
        const params = moorSpecialActionEffectParams(actionId, count)
        const signature = JSON.stringify(params)
        const group = byEffect.get(signature) ?? { params, counts: [] }
        group.counts.push(count)
        byEffect.set(signature, group)
      }
      const note: EncyclopediaText = moorSpecialActionBuysImprovement(actionId)
        ? [SEPARATOR, { key: 'moor.specialActions.improvementCost' }]
        : []
      return [...byEffect.values()].map(({ params, counts }) => [
        { key: `moor.specialActions.${actionId}` },
        ...(byEffect.size > 1 ? [SEPARATOR, ...playerCountText(counts)] : []),
        SEPARATOR,
        { key: `moor.specialActions.effects.${actionId}`, params },
        ...note,
      ])
    }),
  ]),
})

export const seasonTexts = (season: SeasonId): EncyclopediaTexts => ({
  name: [{ key: seasonDisplay[season].nameKey }],
  body: seasonRuleText(season),
})
