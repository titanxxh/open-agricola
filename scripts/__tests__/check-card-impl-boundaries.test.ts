import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cardImplBoundaryExitCode,
  checkCardImplBoundaries,
  walkProductionCardFiles,
} from '../check-card-impl-boundaries'

const writeFixture = (root: string, rel: string, content: string): string => {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
  return full
}

describe('check-card-impl-boundaries', () => {
  it('fails when no production card sources are scanned', () => {
    const result = checkCardImplBoundaries([])

    expect(result.scopeErrors).toContain('no production card files scanned')
    expect(cardImplBoundaryExitCode(result)).toBe(1)
  })

  it('counts the current Card Source and listener handler shape', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      "const listener = { id: 'test', phases: ['after'], handler: () => undefined }",
      'const cardImpl = { listeners: [listener] }',
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: cardImpl,',
      '})',
      'export const A001_Shelter_impl = A001_Shelter.impl',
    ].join('\n'))

    expect(checkCardImplBoundaries([file])).toMatchObject({
      filesChecked: 1,
      cardSourcesChecked: 1,
      listenerHandlersChecked: 1,
      scopeErrors: [],
    })
  })

  it('reports live played-card counts in trailing listeners', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      "const listener = { id: 'test', phases: ['after'], handler: (context: any) => {",
      '  return context.player.occupationPlayed.length > 0 ? undefined : undefined',
      '} }',
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: { listeners: [listener] },',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({ kind: 'trailing-live-played-count' }),
    ])
  })

  it('reports live played-card counts in named trailing handlers with phase casts', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      'const handler = (context: any) => context.player.minorPlayed.length',
      "const listener = { id: 'test', phases: ['immediatelyAfter' as any], handler }",
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: { listeners: [listener] },',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({ kind: 'trailing-live-played-count' }),
    ])
  })

  it('reports direct authority mutation in card listener handlers', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      "const listener = { id: 'test', phases: ['after'], handler: (context: any) => {",
      '  context.player.resources.food += 1',
      '} }',
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: { listeners: [listener] },',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({ kind: 'listener-mutation' }),
    ])
  })

  it('reports mutation through listener-state aliases', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      "const listener = { id: 'test', phases: ['after'], handler: (context: any) => {",
      '  const player = context.player',
      '  const field = player.fields[0]',
      "  field.stacks.unshift({ kind: 'vegetable' })",
      '  player.resources.food++',
      '  delete player.cardStates.test',
      '} }',
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: { listeners: [listener] },',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({ kind: 'listener-mutation' }),
      expect.objectContaining({ kind: 'listener-mutation' }),
      expect.objectContaining({ kind: 'listener-mutation' }),
    ])
  })

  it('reports mutations through nullish authority aliases', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      "const listener = { id: 'test', phases: ['after'], handler: (context: any) => {",
      '  const owner = context.ownerPlayer ?? context.player',
      '  owner.resources.food += 1',
      '} }',
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: { listeners: [listener] },',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({ kind: 'listener-mutation' }),
    ])
  })

  it('allows listener-local object spreads', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      "const listener = { id: 'test', phases: ['after'], handler: (context: any) => {",
      '  const result = { ...context.result }',
      '  return { result }',
      '} }',
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: { listeners: [listener] },',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([])
  })

  it('allows mutations of arrays built with map inside a flow builder', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      'const buildFlow = (context: any, updates: any[]) => {',
      '  const children = updates.map((value) => ({ value }))',
      '  children.push({ ownerId: context.player.id })',
      '  return children',
      '}',
      "const listener = { id: 'test', phases: ['after'], handler: (context: any) => ({ flow: buildFlow(context, []) }) }",
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: { listeners: [listener] },',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([])
  })

  it('reports imported mutator helpers through one same-file wrapper', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      "import { writeCardExtraData as write } from '../helpers/card-state'",
      "const setValue = (player: any) => write(player, 'A001_Shelter', 'value', 1)",
      "const listener = { id: 'test', phases: ['after'], handler: (context: any) => {",
      '  setValue(context.player)',
      '} }',
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: { listeners: [listener] },',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({ kind: 'listener-mutation' }),
    ])
  })

  it('reports mutations through authority-returning field helpers', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      "import { fieldTopStack } from '../../domain/field'",
      "const listener = { id: 'test', phases: ['after'], handler: (context: any) => {",
      '  const field = context.player.fields[0]',
      '  const top = fieldTopStack(field)',
      '  if (top) top.remaining += 1',
      '} }',
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: { listeners: [listener] },',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({ kind: 'listener-mutation' }),
    ])
  })

  it('reports direct mutations through one same-file wrapper', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      'const clear = (player: any) => { player.activeModifiers = [] }',
      "const listener = { id: 'test', phases: ['after'], handler: (context: any) => {",
      '  clear(context.player)',
      '} }',
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: { listeners: [listener] },',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([
      expect.objectContaining({ kind: 'listener-mutation' }),
    ])
  })

  it('allows live counts before an action and snapshot counts after it', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'card-impl-boundaries-'))
    const file = writeFixture(root, 'shared/cards/A/A001_Shelter.ts', [
      "import { defineMinorCard } from '../card-source'",
      "import { countTriggerCardsAs } from '../helpers/trigger-snapshot'",
      "const before = { id: 'before', phases: ['before'], handler: (context: any) => context.player.occupationPlayed.length }",
      "const after = { id: 'after', phases: ['after'], handler: (context: any) => countTriggerCardsAs(context, 'occupation') }",
      'export const A001_Shelter = defineMinorCard({',
      "  meta: { id: 'A001_Shelter' },",
      '  impl: { listeners: [before, after] },',
      '})',
    ].join('\n'))

    expect(checkCardImplBoundaries([file]).violations).toEqual([])
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
