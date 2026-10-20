import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { checkFarmWriteBoundaries, walkProductionFarmFiles } from '../farm-write-boundaries'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { collectFarmWrites } from '../farm-write-scan'

const scan = (text: string) => collectFarmWrites(ts.createSourceFile('shared/cards/A/probe.ts', text, ts.ScriptTarget.Latest, true))

const temporaryRoots: string[] = []
const temporaryRoot = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'farm-scope-'))
  temporaryRoots.push(root)
  return root
}
afterEach(() => temporaryRoots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

const boundaryFixture = (overrides: Record<string, string> = {}) => {
  const root = temporaryRoot()
  const files = {
    'shared/domain/farm-operations.ts': `
      function commitFarmOperation(player: PlayerState) { player.fields = [] }
      function commitPreparedPlayer(player: PlayerState) { player.roomTiles = [] }
    `,
    'shared/session/state-bootstrap.ts': `
      function normalizeState(player: PlayerState) { player.farmTerrain = [] }
      function createInitialState(player: PlayerState) { player.stableTiles = [] }
    `,
    'shared/domain/farmyard-usage-core.ts': 'function usage(player: PlayerState) { return player.fields.length + player.id.length }',
    'shared/domain/farmyard-geometry.ts': 'function geometry(player: PlayerState) { return player.roomTiles.length }',
    'shared/domain/farmyard-space-states.ts': 'function spaces(player: PlayerState) { return player.farmTerrain.length }',
    'server/new-production-path/query.ts': 'function query(player: PlayerState) { return player.fields }',
    ...overrides,
  }
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  return root
}

describe('authoritative farm write boundary', () => {
  it('detects direct layout replacement rather than treating a new card as an unscanned source', () => {
    expect(scan('function effect(player: PlayerState) { player.roomTiles = [] }')).toMatchObject([
      { owner: 'effect', text: 'player.roomTiles = []' },
    ])
  })
  it.each([
    'player.stableTiles.push(tile)',
    'player.farmTerrain[0] = tile',
    'const terrain = player.farmTerrain; terrain.splice(0, 1)',
    'const owner = player; Object.assign(owner, { roomTiles: [] })',
    'const { roomTiles: rooms } = player; rooms[0].row = 2',
    'const terrain = player.farmTerrain.find(candidate => true); terrain.kind = "moor"',
    'player.pastures[0].tiles.push(tile)',
    'player.farmTerrain.forEach(tile => { tile.covered = "moor" })',
    'for (const terrain of player.farmTerrain) { terrain.kind = "moor" }',
    'const terrain = player.farmTerrain[0]; Object.assign(terrain, { covered: "moor" })',
  ])('detects the known structural write %s', body => {
    expect(scan(`function effect(player: PlayerState) { ${body} }`)).toHaveLength(1)
  })

  it('allows detached proposals, crop stacks and animal assignments without confusing scopes', () => {
    expect(scan(`
      function read(player: PlayerState) { const fields = player.fields; return fields.length }
      function propose(player: PlayerState) { const fields = [...player.fields]; fields.push(tile) }
      function crops(player: PlayerState) { player.fields[0].stacks.push(stack); player.pastures[0].animalCount = 1 }
    `)).toEqual([])
  })
  it('scans shared and server, including new directories, and fails on a missing or empty root', () => {
    const root = temporaryRoot()
    expect(() => walkProductionFarmFiles(root)).toThrow()
    mkdirSync(path.join(root, 'shared/new-production-path'), { recursive: true })
    mkdirSync(path.join(root, 'server'), { recursive: true })
    writeFileSync(path.join(root, 'shared/new-production-path/probe.ts'), 'player.roomTiles = []')
    expect(() => walkProductionFarmFiles(root)).toThrow(/empty.*server/)
    writeFileSync(path.join(root, 'server/probe.ts'), 'player.stableTiles.push(tile)')
    expect(walkProductionFarmFiles(root)).toHaveLength(2)
  })

  it('has no production bypasses or stale function exceptions in a valid owner fixture', () => {
    expect(checkFarmWriteBoundaries(boundaryFixture()).violations).toEqual([])
  })

  it.each(['shared/cards/new-production-path/probe.ts', 'server/new-production-path/probe.ts'])(
    'rejects a write outside its approved owner file in %s', relative => {
      const root = boundaryFixture({ [relative]: 'function commitFarmOperation(player: PlayerState) { player.roomTiles = [] }' })
      expect(checkFarmWriteBoundaries(root).violations).toEqual([{
        file: path.join(root, relative), line: 1,
        message: 'farm layout write must use commitFarmOperation: player.roomTiles = []',
      }])
    },
  )

  it('rejects an owner exception after its function stops writing farm layout', () => {
    const root = boundaryFixture({
      'shared/domain/farm-operations.ts': `
        function commitFarmOperation(player: PlayerState) { player.fields = [] }
        function commitPreparedPlayer(player: PlayerState) { return player }
      `,
    })
    expect(checkFarmWriteBoundaries(root).violations).toEqual([{
      file: 'shared/domain/farm-operations.ts#commitPreparedPlayer', message: 'stale farm-write owner exception',
    }])
  })

  it.each([
    'shared/domain/farmyard-usage-core.ts',
    'shared/domain/farmyard-geometry.ts',
    'shared/domain/farmyard-space-states.ts',
  ])('rejects an untracked geometry dependency in %s', relative => {
    const root = boundaryFixture({ [relative]: 'function geometry(player: PlayerState) { return player.untrackedFarmLayout }' })
    expect(checkFarmWriteBoundaries(root).violations).toEqual([{
      file: path.join(root, relative), line: 1,
      message: 'authoritative geometry reads untrackedFarmLayout, missing from FARM_LAYOUT_KEYS and the farm write boundary',
    }])
  })

})
