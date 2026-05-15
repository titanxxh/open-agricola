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
  it('does not install registered lookups merely by importing catalog', () => {
    const output = runIsolated(`
      const types = await import('./shared/cards-display/types.ts')
      await import('./shared/cards/catalog.ts')
      const card = types.getRegisteredMinorImprovement('C59_SchnappsDistillery')
      console.log(card ? 'installed' : 'not-installed')
    `)
    expect(output).toBe('not-installed')
  }, 15_000)

  it('installs registered lookups explicitly and idempotently', () => {
    const output = runIsolated(`
      const types = await import('./shared/cards-display/types.ts')
      const bootstrap = await import('./shared/cards/install-catalog-lookups.ts')
      bootstrap.ensureCatalogLookupsInstalled()
      bootstrap.ensureCatalogLookupsInstalled()
      const minor = types.getRegisteredMinorImprovement('C59_SchnappsDistillery')
      const occupation = types.getRegisteredOccupation('B104_SheepWalker')
      console.log([minor?.id, occupation?.id].join(','))
    `)
    expect(output).toBe('C59_SchnappsDistillery,B104_SheepWalker')
  }, 15_000)

  it('GameSession installs registered lookups without Vitest setup', () => {
    const output = runIsolated(`
      const types = await import('./shared/cards-display/types.ts')
      const { GameSession } = await import('./server/game/authoritative-session.ts')
      new GameSession(undefined, undefined, { playerCount: 2 })
      const minor = types.getRegisteredMinorImprovement('C59_SchnappsDistillery')
      const occupation = types.getRegisteredOccupation('B104_SheepWalker')
      console.log([minor?.id, occupation?.id].join(','))
    `)
    expect(output).toBe('C59_SchnappsDistillery,B104_SheepWalker')
  }, 15_000)
})
