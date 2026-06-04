import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const runIsolated = (code: string): string =>
  execFileSync('pnpm', ['exec', 'tsx', '-e', `
    ;(async () => {
      ${code}
    })().catch((err) => {
      console.error(err)
      process.exit(1)
    })
  `], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

describe('catalog lookup bootstrap', () => {
  it('catalog imports without loading runtime card impls first', () => {
    const output = runIsolated(`
      const catalog = await import('./shared/cards/catalog.ts')
      console.log(catalog.getCardDefinition('Major_Fireplace1')?.id ?? 'missing')
    `)
    expect(output).toBe('Major_Fireplace1')
  }, 15_000)

  it('test-only stub cards are not dealt from the implemented minor catalog', () => {
    const output = runIsolated(`
      const catalog = await import('./shared/cards/catalog.ts')
      console.log(catalog.implementedMinorImprovementCards.some((card) => card.id === 'STUB_BeforeBakeGainClay'))
    `)
    expect(output).toBe('false')
  }, 15_000)

  it('registry-display lookups resolve catalog cards directly', () => {
    const output = runIsolated(`
      const registry = await import('./shared/cards/registry-display.ts')
      const card = registry.getRegisteredMinorImprovement('C59_SchnappsDistillery')
      console.log(card?.id ?? 'missing')
    `)
    expect(output).toBe('C59_SchnappsDistillery')
  }, 15_000)

  it('ensureCatalogLookupsInstalled is idempotent compatibility shim', () => {
    const output = runIsolated(`
      const registry = await import('./shared/cards/registry-display.ts')
      const bootstrap = await import('./shared/cards/install-catalog-lookups.ts')
      bootstrap.ensureCatalogLookupsInstalled()
      bootstrap.ensureCatalogLookupsInstalled()
      const minor = registry.getRegisteredMinorImprovement('C59_SchnappsDistillery')
      const occupation = registry.getRegisteredOccupation('B104_SheepWalker')
      console.log([minor?.id, occupation?.id].join(','))
    `)
    expect(output).toBe('C59_SchnappsDistillery,B104_SheepWalker')
  }, 15_000)

  it('GameSession installs registered lookups without Vitest setup', () => {
    const output = runIsolated(`
      const registry = await import('./shared/cards/registry-display.ts')
      const { GameSession } = await import('./server/game/authoritative-session.ts')
      new GameSession(undefined, undefined, { playerCount: 2 })
      const minor = registry.getRegisteredMinorImprovement('C59_SchnappsDistillery')
      const occupation = registry.getRegisteredOccupation('B104_SheepWalker')
      console.log([minor?.id, occupation?.id].join(','))
    `)
    expect(output).toBe('C59_SchnappsDistillery,B104_SheepWalker')
  }, 30_000)
})
