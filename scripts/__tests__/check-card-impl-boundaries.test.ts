import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkCardImplBoundaries } from '../check-card-impl-boundaries'

const writeFixture = (root: string, rel: string, content: string): string => {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
  return full
}

describe('check-card-impl-boundaries', () => {
  it('reports runtime reads of foreign non-Major card ids', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A1_Shelter.ts', [
      "export const A1_Shelter_impl = {",
      '  effect: {',
      '    onBuy: (_state: any, player: any) => {',
      "      if (!player.occupationPlayed.includes('E89_Stallwright')) return",
      '    },',
      '  },',
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({
        cardId: 'A1_Shelter',
        referencedCardId: 'E89_Stallwright',
      }),
    ])
  })

  it('allows own card ids, Major ids, and reaches declarations', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A1_Shelter.ts', [
      "export const A1_Shelter_impl = {",
      "  reaches: ['E89_Stallwright'] as readonly string[],",
      '  effect: {',
      '    onBuy: (_state: any, player: any) => {',
      "      player.improvements.includes('A1_Shelter')",
      "      player.improvements.includes('Major_Fireplace1')",
      '    },',
      '  },',
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([])
  })

  it('allows allowedPurchases and prerequisite candidate-list contexts', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A1_Shelter.ts', [
      "const OVEN_IDS = ['E63_IronOven'] as const",
      "export const A1_Shelter_impl = {",
      '  effect: {',
      '    onBuy: () => ({',
      "      actionId: 'improvement',",
      '      actionContext: { allowedPurchases: OVEN_IDS },',
      '    }),',
      '  },',
      "  prerequisiteCandidates: ['D25_WitchesDanceFloor'],",
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([])
  })

  it('reports runtime uses of same-file const string and array aliases', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A1_Shelter.ts', [
      "const STALLWRIGHT_ID = 'E89_Stallwright' as const",
      "const SUPPORT_IDS: readonly string[] = ['D25_WitchesDanceFloor', 'Major_Fireplace1'] as const",
      "export const A1_Shelter_impl = {",
      '  effect: {',
      '    onBuy: (_state: any, player: any) => {',
      '      player.occupationPlayed.includes(STALLWRIGHT_ID)',
      '      SUPPORT_IDS.includes(player.improvements[0])',
      '    },',
      '  },',
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({ referencedCardId: 'E89_Stallwright' }),
      expect.objectContaining({ referencedCardId: 'D25_WitchesDanceFloor' }),
    ])
  })

  it('ignores card ids in comments', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A1_Shelter.ts', [
      '// E89_Stallwright is mentioned in a migration note only.',
      'export const A1_Shelter_impl = {',
      '  effect: { onBuy: () => undefined },',
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([])
  })
})
