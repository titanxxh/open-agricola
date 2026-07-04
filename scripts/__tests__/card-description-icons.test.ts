import { describe, expect, it } from 'vitest'
import { buildCardsManifest } from '../build-cards-manifest'

const ICON_WORDS = [
  'fuel',
  'food',
  'wood',
  'clay',
  'reed',
  'stone',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'pig',
  'cattle',
  'horse',
  'stable',
  'fence',
  'field',
  'forest',
  'moor',
] as const

const PROTECTED_PHRASES = [
  /__[^_]+__/g,
  /"[^"]+"/g,
  /\b(?:wood|clay|stone) house\b/gi,
  /\b(?:wooden|clay|stone) houses?\b/gi,
  /\b(?:wood|clay|stone) rooms?\b/gi,
  /\b(?:wood|clay|stone)(?:\/(?:wood|clay|stone))+ rooms?\b/gi,
  /\bwooden rooms?\b/gi,
  /\bclay rooms?\b/gi,
  /\bstone rooms?\b/gi,
  /\bfield phase\b/gi,
  /\bfield worker\b/gi,
  /\bsheep farmer\b/gi,
  /\bsheep whisperer\b/gi,
  /\bpig breeder\b/gi,
  /\bpig whisperer\b/gi,
  /\bcattle whisperer\b/gi,
  /\bgrain seeds\b/gi,
  /\bvegetable seeds\b/gi,
  /\bforest pasture\b/gi,
  /\bMuseum of the Moors\b/gi,
  /\bLiving History Museum\b/gi,
  /\bClay Oven\b/gi,
  /\bStone Oven\b/gi,
  /\bRiding Stables\b/gi,
  /\bHorse Slaughterhouses\b/gi,
  /\bHorse Market\b/gi,
]

const ICON_WORD_RE = new RegExp(
  [
    ...ICON_WORDS.map((word) => `\\b${word}s?\\b`),
    '\\bbonus\\s+(?:victory\\s+)?points?\\b',
  ].join('|'),
  'i',
)

const textWithoutIconTokens = (text: string) => {
  let normalized = text.replace(/<[^>]+>/g, '')
  for (const phrase of PROTECTED_PHRASES) {
    normalized = normalized.replace(phrase, '')
  }
  return normalized
}

describe('card description icons', () => {
  it('allows pasture wording to remain plain text', () => {
    expect(ICON_WORD_RE.test(textWithoutIconTokens('pasture pastures'))).toBe(false)
  })

  it('keeps icon-like words tokenized in production card descriptions', () => {
    const manifest = buildCardsManifest('shared/cards')
    const offenders = Object.values(manifest)
      .filter((entry) => !entry.module.startsWith('shared/cards/__stubs__/'))
      .flatMap((entry) =>
        (entry.meta.desc ?? []).flatMap((desc) => {
          const plain = textWithoutIconTokens(desc)
          return ICON_WORD_RE.test(plain)
            ? [`${entry.meta.id}: ${desc}`]
            : []
        }))

    expect(offenders).toEqual([])
  })
})
