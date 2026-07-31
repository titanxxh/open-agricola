import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalDbPath = process.env.DB_PATH
let tempDir = ''

const createViewerBuild = (root: string): string => {
  const index = Buffer.from('<!doctype html>')
  const manifest = Buffer.from(JSON.stringify({
    entrypoint: 'index.html',
    files: {
      'index.html': createHash('sha256').update(index).digest('hex'),
    },
  }))
  const buildId = createHash('sha256').update(manifest).digest('hex')
  const directory = join(root, buildId)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'index.html'), index)
  writeFileSync(join(directory, 'manifest.json'), manifest)
  return buildId
}

afterEach(() => {
  if (originalDbPath === undefined) delete process.env.DB_PATH
  else process.env.DB_PATH = originalDbPath
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = ''
  vi.resetModules()
})

describe('replay room restoration', () => {
  it('loads and pins published custom cards before creating a missing-prefix replay', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-replay-restore-'))
    process.env.DB_PATH = join(tempDir, 'test.db')
    vi.resetModules()
    const { getDb } = await import('../../db.ts')
    const db = getDb()
    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, created_at)
      VALUES ('author', 'author', 'Author', 'hash', 1)
    `).run()
    const { createCard, publish } = await import('../../workshop-drafts.ts')
    const card = createCard(db, {
      authorId: 'author',
      draft: {
        cardId: 'CUSTOM_Restored',
        cardType: 'minor',
        name: 'Restored',
        description: 'Restored card',
        cardJson: {
          id: 'CUSTOM_Restored',
          name: 'Restored',
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 1,
          desc: ['Restored card'],
        },
        effectCode: null,
        compiledCode: null,
        codeManifest: null,
        artUrl: null,
        generation: {},
      } as never,
    })
    publish(db, { cardId: card.id, authorId: 'author', baseRevision: card.revision })
    const { GameSession } = await import('../../game/authoritative-session.ts')
    const { serializeState } = await import('../../../shared/session/serialization.ts')
    const { SqliteRoomPersistence } = await import('../../game/persistence/sqlite-adapter.ts')
    const persistence = new SqliteRoomPersistence(db)
    const session = new GameSession(587, undefined, { playerCount: 2 })
    const viewerRoot = join(tempDir, 'viewers')
    const viewerBuildId = createViewerBuild(viewerRoot)
    persistence.save(
      'custom-room',
      serializeState(session.state, { engineStack: session.getEngineStack() }),
      {
        createdBy: 'author',
        startedAt: 100,
        maxPlayers: 2,
        customCardDbIds: [card.id],
        status: 'playing',
        players: [],
        replayRecording: true,
        replayViewerBuildId: viewerBuildId,
        replayGameBuildId: 'game-1',
      },
    )
    const { createWsServer } = await import('../ws-server.ts')
    const server = createServer()
    const result = createWsServer(server, {
      persistence,
      replay: {
        enabled: true,
        viewerBuildId,
        gameBuildId: 'game-1',
        viewerRoot,
      },
    })

    try {
      expect(result.registry.get('custom-room')?.session.getCustomCardDefs())
        .toEqual([expect.objectContaining({
          cardType: 'minor',
          cardJson: expect.objectContaining({ id: 'CUSTOM_Restored' }),
        })])
      const archived = db.prepare(`
        SELECT custom_cards_json FROM game_replays WHERE room_id = ?
      `).get('custom-room') as { custom_cards_json: string }
      expect(JSON.parse(archived.custom_cards_json)).toEqual([
        expect.objectContaining({
          cardType: 'minor',
          cardJson: expect.objectContaining({ id: 'CUSTOM_Restored' }),
        }),
      ])
      expect(persistence.load('custom-room')?.meta.customCards).toEqual([
        expect.objectContaining({
          cardType: 'minor',
          cardJson: expect.objectContaining({ id: 'CUSTOM_Restored' }),
        }),
      ])

      db.prepare('DELETE FROM workshop_cards WHERE id = ?').run(card.id)
      const restoredServer = createServer()
      const restored = createWsServer(restoredServer, {
        persistence,
        replay: {
          enabled: true,
          viewerBuildId,
          gameBuildId: 'game-2',
          viewerRoot,
        },
      })
      try {
        expect(restored.registry.get('custom-room')?.session.getCustomCardDefs())
          .toEqual([expect.objectContaining({
            cardType: 'minor',
            cardJson: expect.objectContaining({ id: 'CUSTOM_Restored' }),
          })])
      } finally {
        restored.shutdown()
        restoredServer.close()
      }
    } finally {
      result.shutdown()
      server.close()
      db.close()
    }
  })
})
