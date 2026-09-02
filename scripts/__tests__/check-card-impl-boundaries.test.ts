import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cardImplBoundaryExitCode,
  checkCardImplBoundaries,
  checkFieldStorageBoundaries,
  walkProductionCardFiles,
  walkProductionFieldBoundaryFiles,
} from '../check-card-impl-boundaries'

const writeFixture = (root: string, rel: string, content: string): string => {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
  return full
}

describe('check-card-impl-boundaries', () => {
  it('fails when the production scope is empty', () => {
    const result = checkCardImplBoundaries([], [])

    expect(result.scopeErrors).toEqual(expect.arrayContaining([
      'no production card files scanned',
      'no production card implementations scanned',
    ]))
    expect(cardImplBoundaryExitCode(result)).toBe(1)
  })

  it('fails when a production file is not a Card Source', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(
      root,
      'shared/cards/A/A001_Shelter.ts',
      'export const A001_Shelter_impl = {}',
    )

    expect(checkCardImplBoundaries([file]).scopeErrors).toContain(
      'found 0 Card Sources for 1 production card files',
    )
  })

  it('counts Card Sources and runtime-resolved listener handlers', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: {},',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file], [{
      cardId: 'A001_Shelter',
      file,
      listeners: [{ id: 'resolved-listener', phases: ['after'], handler: () => undefined }],
    }])).toMatchObject({
      filesChecked: 1,
      cardSourcesChecked: 1,
      listenerHandlersChecked: 1,
      trailingListenerHandlersChecked: 1,
      scopeErrors: [],
    })
  })

  it.each(['during', 'immediatelyAfter', 'after'])(
    'reports live played-card counts in %s listeners',
    (phase) => {
      const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
      const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
        "import { defineMinorCard } from '../card-source'",
        'export const A001_Shelter = defineMinorCard({',
        "  meta: { id: 'A001_Shelter' },",
        '  impl: {},',
        '})',
      ].join('\n'))
      const handler = (context: { player: { occupationPlayed: string[] } }) =>
        context.player.occupationPlayed.length

      const result = checkCardImplBoundaries([file], [{
        cardId: 'A001_Shelter',
        file,
        listeners: [{ id: 'resolved-listener', phases: [phase], handler }],
      }])

      expect(result.violations).toEqual([
        expect.objectContaining({
          cardId: 'A001_Shelter',
          kind: 'trailing-live-played-count',
          message: expect.stringContaining('resolved-listener'),
        }),
      ])
      expect(result.violations[0]?.line).toBeUndefined()
    },
  )

  it('allows live counts before an action and membership checks after it', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: {},',
      '})',
    ].join('\n'))
    const before = (context: { player: { occupationPlayed: string[] } }) =>
      context.player.occupationPlayed.length
    const after = (context: { player: { occupationPlayed: string[] } }) =>
      context.player.occupationPlayed.includes('A001_Shelter')

    expect(checkCardImplBoundaries([file], [{
      cardId: 'A001_Shelter',
      file,
      listeners: [
        { id: 'before', phases: ['before'], handler: before },
        { id: 'after', phases: ['after'], handler: after },
      ],
    }]).violations).toEqual([])
  })

  it('allows trigger snapshot counts in trailing listeners', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: {},',
      '})',
    ].join('\n'))
    const handler = (context: { triggerSnapshot: { occupationPlayedCount: number } }) =>
      context.triggerSnapshot.occupationPlayedCount

    expect(checkCardImplBoundaries([file], [{
      cardId: 'A001_Shelter',
      file,
      listeners: [{ id: 'after', phases: ['after'], handler }],
    }]).violations).toEqual([])
  })

  it('fails when the runtime listener scope is empty', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: {},',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file], [{
      cardId: 'A001_Shelter',
      file,
      listeners: [],
    }]).scopeErrors).toEqual(expect.arrayContaining([
      'no card listener handlers scanned',
      'no trailing card listener handlers scanned',
    ]))
  })

  it('fails when a Card Source impl is missing from the runtime scope', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const files = ['A001_Shelter', 'A002_ShiftingCultivation'].map((cardId) =>
      writeFixture(root, `shared/cards/A/${cardId}.ts`, [
        "import { defineMinorCard } from '../card-source'",
        `export const ${cardId} = defineMinorCard({`,
        `  meta: { id: '${cardId}' },`,
        '  impl: {},',
        '})',
      ].join('\n')),
    )

    expect(checkCardImplBoundaries(files, [{
      cardId: 'A001_Shelter',
      file: files[0]!,
      listeners: [{ id: 'after', phases: ['after'], handler: () => undefined }],
    }]).scopeErrors).toContain(
      'runtime Card Impl scope mismatch: missing A002_ShiftingCultivation; unexpected none',
    )
  })

  it('fails closed when a trailing runtime handler cannot be parsed', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: {},',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file], [{
      cardId: 'A001_Shelter',
      file,
      listeners: [{ id: 'native', phases: ['after'], handler: Array.prototype.push }],
    }]).scopeErrors).toContain('cannot parse trailing listener A001_Shelter:native')
  })
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

  it('allows declared named printed targets for public played-card membership checks', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/M/M063_PastoralLetter.ts', [
      "const CHURCH = 'M068_Church'",
      'export const M063_PastoralLetter_impl = {',
      '  effect: {',
      '    computeBonusScore: (_state: any, player: any) =>',
      '      player.minorPlayed.includes(CHURCH) ? 1 : 0,',
      '  },',
      '  reaches: [CHURCH],',
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([])
  })

  it('reports private state reads even when the target is declared in reaches', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/M/M063_PastoralLetter.ts', [
      "const CHURCH = 'M068_Church'",
      'export const M063_PastoralLetter_impl = {',
      '  effect: {',
      '    computeBonusScore: (_state: any, player: any) =>',
      '      player.cardStates?.[CHURCH]?.counters?.held ?? 0,',
      '  },',
      '  reaches: [CHURCH],',
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({
        cardId: 'M063_PastoralLetter',
        referencedCardId: 'M068_Church',
      }),
    ])
  })

  it('reports private state reads nested inside public membership arguments', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/M/M063_PastoralLetter.ts', [
      "const CHURCH = 'M068_Church'",
      'export const M063_PastoralLetter_impl = {',
      '  effect: {',
      '    computeBonusScore: (_state: any, player: any) =>',
      '      player.minorPlayed.includes(player.cardStates?.[CHURCH]?.counters?.held ? CHURCH : CHURCH) ? 1 : 0,',
      '  },',
      '  reaches: [CHURCH],',
      '}',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({
        cardId: 'M063_PastoralLetter',
        referencedCardId: 'M068_Church',
      }),
      expect.objectContaining({
        cardId: 'M063_PastoralLetter',
        referencedCardId: 'M068_Church',
      }),
      expect.objectContaining({
        cardId: 'M063_PastoralLetter',
        referencedCardId: 'M068_Church',
      }),
    ])
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
        cardSourcesChecked: 1,
        listenerHandlersChecked: 1,
        trailingListenerHandlersChecked: 1,
        scopeErrors: [],
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
          cardSourcesChecked: 1,
          listenerHandlersChecked: 1,
          trailingListenerHandlersChecked: 1,
          scopeErrors: [],
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

  it('scans Farmers of the Moor production cards', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/M/M999_Test.ts', [
      "export const M999_Test_impl = {",
      '  effect: { onBuy: () => undefined },',
      '}',
    ].join('\n'))

    expect(walkProductionCardFiles(root)).toContain(file)
  })

  it('does not scan deck-local helper files as card implementations', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const helper = writeFixture(root, 'shared/cards/M/M999_Test-state.ts', [
      "export const CARD_ID = 'M999_Test'",
    ].join('\n'))

    expect(walkProductionCardFiles(root)).not.toContain(helper)
  })

  it('rejects property and bracket fields access through any receiver name', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const property = writeFixture(
      root,
      'shared/cards/A/A001_Shelter.ts',
      'export const count = alternateReceiver.fields.length',
    )
    const bracket = writeFixture(
      root,
      'shared/cards/helpers/example.ts',
      "export const count = renamed['fields'].length",
    )

    expect(checkFieldStorageBoundaries([property, bracket])).toEqual([
      expect.objectContaining({ file: property, kind: 'direct-field-storage', line: 1 }),
      expect.objectContaining({ file: bracket, kind: 'direct-field-storage', line: 1 }),
    ])
  })

  it('allows boundary calls and direct storage only in the Farmyard adapter', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const card = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      'getLogicalFields(player)',
      'getFarmyardFields(player)',
      'mutateLogicalFields(state, player)',
    ].join('\n'))
    const owner = writeFixture(
      root,
      'shared/cards/helpers/card-field.ts',
      "player.fields; player['fields']",
    )

    expect(checkFieldStorageBoundaries([card, owner])).toEqual([])
  })

  it('scans every production Card Impl field-boundary directory', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const expected = ['A', 'B', 'C', 'D', 'E', 'M', 'major', 'community', 'helpers'].map((dir) =>
      writeFixture(root, `shared/cards/${dir}/example.ts`, 'export const value = 1'),
    )

    expect(walkProductionFieldBoundaryFiles(root)).toEqual(expected.sort())
  })

  it('has no direct field-storage bypass in production Card Impls', () => {
    const repoRoot = path.resolve(__dirname, '..', '..')
    const files = walkProductionFieldBoundaryFiles(repoRoot)

    expect(checkFieldStorageBoundaries(files)).toEqual([])
  })

  it('keeps single-card state out of generic animal runtime files', () => {
    const repoRoot = path.resolve(__dirname, '..', '..')
    const files = [
      'shared/actions/effects/breed.ts',
      'shared/domain/scoring.ts',
      'shared/domain/animal-payment.ts',
    ]

    for (const file of files) {
      const source = readFileSync(path.join(repoRoot, file), 'utf8')
      expect(source, file).not.toMatch(/M084|BogPony|bog-pony|lyingHorse/)
    }
  })
})
