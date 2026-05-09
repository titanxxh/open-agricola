import { describe, it, expect } from 'vitest'
import { rewriteImports } from '../codemod-cards-display-redirect'

const run = (input: string): string =>
  rewriteImports({ sourcePath: 'server/__tests__/foo.test.ts', sourceText: input }).text

describe('codemod-cards-display-redirect: rewriteImports', () => {
  it('display-only: redirects path', () => {
    const input = `import { A20_DoubleTurnPlow } from '../../shared/cards/A/A20_DoubleTurnPlow'\n`
    const expected = `import { A20_DoubleTurnPlow } from '../../shared/cards-display/A/A20_DoubleTurnPlow'\n`
    expect(run(input)).toBe(expected)
  })

  it('impl-only: leaves untouched', () => {
    const input = `import { B27_Toolbox_impl } from '../../shared/cards/B/B27_Toolbox'\n`
    expect(run(input)).toBe(input)
  })

  it('mixed display + impl: splits into 2 lines', () => {
    const input = `import { D62_BeerTap, D62_BeerTap_impl } from '../../shared/cards/D/D62_BeerTap'\n`
    const expected =
      `import { D62_BeerTap } from '../../shared/cards-display/D/D62_BeerTap'\n` +
      `import { D62_BeerTap_impl } from '../../shared/cards/D/D62_BeerTap'\n`
    expect(run(input)).toBe(expected)
  })

  it('helper-only (e.g. hasAdjacentWorker): leaves untouched', () => {
    const input = `import { hasAdjacentWorker } from '../../shared/cards/C/C117_Legworker'\n`
    expect(run(input)).toBe(input)
  })

  it('mixed display + helper: splits, helper stays on cards/', () => {
    const input = `import { C117_Legworker, hasAdjacentWorker } from '../../shared/cards/C/C117_Legworker'\n`
    const expected =
      `import { C117_Legworker } from '../../shared/cards-display/C/C117_Legworker'\n` +
      `import { hasAdjacentWorker } from '../../shared/cards/C/C117_Legworker'\n`
    expect(run(input)).toBe(expected)
  })

  it('display + impl + helper: splits display, impl + helper on cards/', () => {
    const input = `import { X1_Foo, X1_Foo_impl, helperFn } from '../../shared/cards/X/X1_Foo'\n`
    // X is not in [A-E], so should be untouched (regex requires A-E)
    expect(run(input)).toBe(input)

    const inputAE = `import { A1_Shelter, A1_Shelter_impl, helperFn } from '../../shared/cards/A/A1_Shelter'\n`
    const expectedAE =
      `import { A1_Shelter } from '../../shared/cards-display/A/A1_Shelter'\n` +
      `import { A1_Shelter_impl, helperFn } from '../../shared/cards/A/A1_Shelter'\n`
    expect(run(inputAE)).toBe(expectedAE)
  })

  it('display with alias: preserves alias on redirect', () => {
    const input = `import { A28_ForestSchool as A28Card } from '../../shared/cards/A/A28_ForestSchool'\n`
    const expected = `import { A28_ForestSchool as A28Card } from '../../shared/cards-display/A/A28_ForestSchool'\n`
    expect(run(input)).toBe(expected)
  })

  it('multiple imports same file: independent handling', () => {
    const input =
      `import { A20_DoubleTurnPlow } from '../../shared/cards/A/A20_DoubleTurnPlow'\n` +
      `import { B27_Toolbox_impl } from '../../shared/cards/B/B27_Toolbox'\n` +
      `import { D62_BeerTap, D62_BeerTap_impl } from '../../shared/cards/D/D62_BeerTap'\n`
    const expected =
      `import { A20_DoubleTurnPlow } from '../../shared/cards-display/A/A20_DoubleTurnPlow'\n` +
      `import { B27_Toolbox_impl } from '../../shared/cards/B/B27_Toolbox'\n` +
      `import { D62_BeerTap } from '../../shared/cards-display/D/D62_BeerTap'\n` +
      `import { D62_BeerTap_impl } from '../../shared/cards/D/D62_BeerTap'\n`
    expect(run(input)).toBe(expected)
  })

  it('non-card path: untouched', () => {
    const input =
      `import { foo } from '../../shared/cards/types'\n` +
      `import { bar } from '../../shared/cards/registry'\n` +
      `import { baz } from '../../shared/util/something'\n`
    expect(run(input)).toBe(input)
  })
})
