import { describe, expect, it } from 'vitest'
import { en } from '../../shared/i18n/en'
import { zh } from '../../shared/i18n/zh'
import { fatherParentCards } from '../../shared/parents/cards/fathers'
import { motherParentCards } from '../../shared/parents/cards/mothers'
import { buildCardsManifest } from '../build-cards-manifest'

const ALLOWED_DOUBLE_UNDERSCORE_LABELS = new Set([
  'Bake Bread',
  'Animal Market',
  "Basketmaker's Workshop",
  'Build Fences',
  'Build Rooms',
  'Build Stables',
  'Build Wood Rooms',
  'Cattle Market',
  'Clay Oven',
  'Clay Pit',
  'Corral',
  'Cultivation',
  'Cut Peat',
  'Day Laborer',
  'Family Growth',
  'Family Growth Even without Room',
  'Family Growth with Room Only',
  'Farm Expansion',
  'Farm Redevelopment',
  'Farm Supplies',
  'Farmland',
  'Fell Trees',
  'Fencing',
  'Fireplace',
  'Fishing',
  'Forest',
  'Grain Seeds',
  'Grain Utilization',
  'Grain/Vegetable Seeds',
  'Grove',
  'Hiring Fair',
  'Hollow',
  'House Redevelopment',
  'House Building',
  'Joinery',
  'Lessons',
  'Major Improvement',
  'Major or Minor Improvement',
  'Meeting Place',
  'Minor Improvement',
  'Minor/Major Improvement',
  'Pig Market',
  'Pottery',
  'Quarry',
  'Reed Bank',
  'Renovation',
  'Resource Market',
  'Resource Trade',
  'Riverbank Forest',
  'Sheep Market',
  'Side Job',
  'Slash and Burn',
  'Sow',
  'Stone Oven',
  'Traveling Players',
  'Urgent Wish for Children',
  'Vegetable Seeds',
  'Well',
  'Wish for Children',
] as const)

const REQUIRED_DOUBLE_UNDERSCORE_REFERENCES = [
  'Animal Market',
  'Bake Bread',
  'Build Fences',
  'Build Rooms',
  'Cattle Market',
  'Clay Pit',
  'Corral',
  'Cultivation',
  'Cut Peat',
  'Day Laborer',
  'Farm Supplies',
  'Farming Supplies',
  'Farmland',
  'Fell Trees',
  'Fencing',
  'Fishing',
  'Grain Seeds',
  'Grain Utilization',
  'Hiring Fair',
  'House Building',
  'House Redevelopment',
  'Lessons',
  'Major Improvement',
  'Major or Minor Improvement',
  'Meeting Place',
  'Minor Improvement',
  'Minor/Major Improvement',
  'Pig Market',
  'Quarry',
  'Reed Bank',
  'Renovation',
  'Resource Market',
  'Resource Trade',
  'Riverbank Forest',
  'Sheep Market',
  'Side Job',
  'Slash and Burn',
  'Sow',
  'Traveling Players',
  'Vegetable Seeds',
  'Wish for Children',
] as const

const DOUBLE_UNDERSCORE_RE = /__([^_]+)__/g

const doubleUnderscoreLabels = (text: string) =>
  [...text.matchAll(DOUBLE_UNDERSCORE_RE)].map((match) => match[1])

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const unprotectedText = (text: string) =>
  text.replace(DOUBLE_UNDERSCORE_RE, (match) => ' '.repeat(match.length))

const missingDoubleUnderscoreReferences = (text: string) => {
  const plain = unprotectedText(text)
  return REQUIRED_DOUBLE_UNDERSCORE_REFERENCES.filter((label) => {
    const escaped = escapeRegExp(label)
    return [
      new RegExp(`"${escaped}"`),
      new RegExp(`\\b${escaped}\\b(?=\\s+(?:action|action space|accumulation space|special action)s?\\b)`),
      new RegExp(`\\bSpecial action:\\s*${escaped}\\b`),
    ].some((pattern) => pattern.test(plain))
  })
}

const translatedDescriptions = (dictionary: unknown) => {
  const out: Array<{ path: string, desc: string }> = []
  const visit = (node: unknown, path: string[]) => {
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if ((key === 'description' || key === 'desc') && typeof value === 'string') {
        out.push({ path: [...path, key].join('.'), desc: value })
      }
      visit(value, [...path, key])
    }
  }
  visit(dictionary, [])
  return out
}

const translatedCardDescriptions = (dictionary: unknown) =>
  translatedDescriptions(dictionary).filter(({ path }) =>
    /^(cards|improvements)\.[^.]+\.(?:description|desc)$/.test(path),
  )

const parentCardDescriptions = () =>
  [...fatherParentCards, ...motherParentCards].flatMap((card) => [
    { id: card.id, desc: card.text },
    ...('rewards' in card
      ? card.rewards.map((reward) => ({ id: `${card.id}:${reward.tier}`, desc: reward.rewardText }))
      : []),
  ])

describe('card description double-underscore markup', () => {
  it('keeps double underscores limited to known card, action, and action-space names', () => {
    const manifest = buildCardsManifest('shared/cards')
    const manifestOffenders = Object.values(manifest)
      .filter((entry) => !entry.module.startsWith('shared/cards/__stubs__/'))
      .flatMap((entry) =>
        (entry.meta.desc ?? []).flatMap((desc) =>
          doubleUnderscoreLabels(desc)
            .filter((label) => !ALLOWED_DOUBLE_UNDERSCORE_LABELS.has(label))
            .map((label) => `${entry.meta.id}: __${label}__ in ${desc}`),
        ),
      )
    const i18nOffenders = [
      ['en', en],
      ['zh', zh],
    ].flatMap(([locale, dictionary]) =>
      translatedDescriptions(dictionary).flatMap(({ path, desc }) =>
        doubleUnderscoreLabels(desc)
          .filter((label) => !ALLOWED_DOUBLE_UNDERSCORE_LABELS.has(label))
          .map((label) => `${locale}.${path}: __${label}__ in ${desc}`),
      ),
    )
    const parentOffenders = parentCardDescriptions().flatMap(({ id, desc }) =>
      doubleUnderscoreLabels(desc)
        .filter((label) => !ALLOWED_DOUBLE_UNDERSCORE_LABELS.has(label))
        .map((label) => `${id}: __${label}__ in ${desc}`),
    )

    expect([...manifestOffenders, ...i18nOffenders, ...parentOffenders]).toEqual([])
  })

  it('requires named actions and action spaces to use double underscores in card descriptions', () => {
    const manifest = buildCardsManifest('shared/cards')
    const manifestOffenders = Object.values(manifest)
      .filter((entry) => !entry.module.startsWith('shared/cards/__stubs__/'))
      .flatMap((entry) =>
        (entry.meta.desc ?? []).flatMap((desc) =>
          missingDoubleUnderscoreReferences(desc)
            .map((label) => `${entry.meta.id}: ${label} in ${desc}`),
        ),
      )
    const i18nOffenders = [
      ['en', en],
      ['zh', zh],
    ].flatMap(([locale, dictionary]) =>
      translatedCardDescriptions(dictionary).flatMap(({ path, desc }) =>
        missingDoubleUnderscoreReferences(desc)
          .map((label) => `${locale}.${path}: ${label} in ${desc}`),
      ),
    )
    const parentOffenders = parentCardDescriptions().flatMap(({ id, desc }) =>
      missingDoubleUnderscoreReferences(desc)
        .map((label) => `${id}: ${label} in ${desc}`),
    )

    expect([...manifestOffenders, ...i18nOffenders, ...parentOffenders]).toEqual([])
  })

  it('documents labels that should not use double underscores', () => {
    expect(ALLOWED_DOUBLE_UNDERSCORE_LABELS.has('1 <WOOD>')).toBe(false)
    expect(ALLOWED_DOUBLE_UNDERSCORE_LABELS.has('7 in draft mode')).toBe(false)
  })
})
