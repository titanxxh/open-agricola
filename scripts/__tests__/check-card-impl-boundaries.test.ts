import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cardImplBoundaryExitCode, checkCardImplBoundaries } from '../check-card-impl-boundaries'

const writeFixture = (root: string, rel: string, content: string): string => {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
  return full
}

describe('check-card-impl-boundaries', () => {
  it('reports runtime reads of foreign non-Major card ids', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "export const A001_Shelter_impl = {",
      '  effect: {',
      '    onBuy: (_state: any, player: any) => {',
      "      if (!player.occupationPlayed.includes('E089_Stallwright')) return",
      '    },',
      '  },',
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({
        cardId: 'A001_Shelter',
        referencedCardId: 'E089_Stallwright',
      }),
    ])
  })

  it('allows own card ids, Major ids, and reaches declarations', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "export const A001_Shelter_impl = {",
      "  reaches: ['E089_Stallwright'] as readonly string[],",
      '  effect: {',
      '    onBuy: (_state: any, player: any) => {',
      "      player.improvements.includes('A001_Shelter')",
      "      player.improvements.includes('Major_Fireplace1')",
      '    },',
      '  },',
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([])
  })

  it('allows allowedPurchases and prerequisite candidate-list contexts', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "const OVEN_IDS = ['E063_IronOven'] as const",
      "export const A001_Shelter_impl = {",
      '  effect: {',
      '    onBuy: () => ({',
      "      actionId: 'improvement',",
      '      actionContext: { allowedPurchases: OVEN_IDS },',
      '    }),',
      '  },',
      "  prerequisiteCandidates: ['D025_WitchesDanceFloor'],",
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([])
  })

  it('reports runtime uses of same-file const string and array aliases', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "const STALLWRIGHT_ID = 'E089_Stallwright' as const",
      "const SUPPORT_IDS: readonly string[] = ['D025_WitchesDanceFloor', 'Major_Fireplace1'] as const",
      "export const A001_Shelter_impl = {",
      '  effect: {',
      '    onBuy: (_state: any, player: any) => {',
      '      player.occupationPlayed.includes(STALLWRIGHT_ID)',
      '      SUPPORT_IDS.includes(player.improvements[0])',
      '    },',
      '  },',
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({ referencedCardId: 'E089_Stallwright' }),
      expect.objectContaining({ referencedCardId: 'D025_WitchesDanceFloor' }),
    ])
  })

  it('ignores card ids in comments', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      '// E089_Stallwright is mentioned in a migration note only.',
      'export const A001_Shelter_impl = {',
      '  effect: { onBuy: () => undefined },',
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([])
  })

  it('fails by default when boundary violations remain', () => {
    expect(
      cardImplBoundaryExitCode({
        filesChecked: 1,
        violations: [
          {
            file: 'shared/cards/A/A001_Shelter.ts',
            line: 4,
            cardId: 'A001_Shelter',
            referencedCardId: 'E089_Stallwright',
          },
        ],
      }),
    ).toBe(1)
  })

  it('can still be run in explicit warn-only mode', () => {
    expect(
      cardImplBoundaryExitCode(
        {
          filesChecked: 1,
          violations: [
            {
              file: 'shared/cards/A/A001_Shelter.ts',
              line: 4,
              cardId: 'A001_Shelter',
              referencedCardId: 'E089_Stallwright',
            },
          ],
        },
        { warnOnly: true },
      ),
    ).toBe(0)
  })
})
