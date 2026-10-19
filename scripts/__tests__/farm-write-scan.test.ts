import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { checkFarmWriteBoundaries, walkProductionFarmFiles } from '../farm-write-boundaries'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { collectFarmWrites } from '../farm-write-scan'

const scan = (text: string) => collectFarmWrites(ts.createSourceFile('shared/cards/A/probe.ts', text, ts.ScriptTarget.Latest, true))

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
    const root = mkdtempSync(path.join(tmpdir(), 'farm-scope-'))
    expect(() => walkProductionFarmFiles(root)).toThrow()
    mkdirSync(path.join(root, 'shared/new-production-path'), { recursive: true })
    mkdirSync(path.join(root, 'server'), { recursive: true })
    writeFileSync(path.join(root, 'shared/new-production-path/probe.ts'), 'player.roomTiles = []')
    expect(() => walkProductionFarmFiles(root)).toThrow(/empty.*server/)
    writeFileSync(path.join(root, 'server/probe.ts'), 'player.stableTiles.push(tile)')
    expect(walkProductionFarmFiles(root)).toHaveLength(2)
  })

  it('has no production bypasses or stale function exceptions', () => {
    expect(checkFarmWriteBoundaries(path.resolve(__dirname, '../..')).violations).toEqual([])
  })

})
