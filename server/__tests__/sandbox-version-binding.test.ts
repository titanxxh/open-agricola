import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterAll, describe, expect, it, vi } from 'vitest'

type MockRes = ServerResponse & { statusCode: number; body: string }

import { getDb } from '../db'
import { seedResourceCatalog } from './_helpers/objects'
vi.mock('../db', async () => {
  const { createTestDatabase } = await import('./_helpers/postgres')
  const db = await createTestDatabase()
  return { getDb: () => db }
})
afterAll(async () => { await getDb().close() })

const mockReq = (
  method: string,
  url: string,
  body: unknown,
  token: string,
): IncomingMessage => {
  const bodyText = JSON.stringify(body)
  const request = {
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    on(event: string, callback: (chunk?: Buffer) => void) {
      if (event === 'data') callback(Buffer.from(bodyText))
      if (event === 'end') callback()
      return request
    },
  }
  return request as unknown as IncomingMessage
}

const mockRes = (): MockRes => {
  let statusCode = 200
  let body = ''
  return {
    get statusCode() { return statusCode },
    set statusCode(value) { statusCode = value },
    get body() { return body },
    writeHead(code: number) { statusCode = code },
    end(data?: string) { body = data ?? '' },
  } as unknown as MockRes
}

describe('sandbox version binding', () => {
  it('loads the requested immutable workshop version instead of the mutable draft', async () => {
    const { getDb } = await import('../db.ts')
    const {
      adoptCandidate,
      checkpointDraft,
      createCard,
      approveCurrentDraft,
    } = await import('../workshop-drafts.ts')
    const db = getDb()
    const now = Date.now()
    ;(await db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, created_at)
      VALUES ('author', 'sandbox_author', 'Sandbox Author', 'x', ?)
    `).run(now))
    ;(await db.prepare(`
      INSERT INTO sessions (token, user_id, expires_at, created_at)
      VALUES ('sandbox-token', 'author', ?, ?)
    `).run(now + 3_600_000, now))
    const original = (await createCard(db, {
      authorId: 'author',
      draft: {
        cardId: 'CUSTOM_PinnedVersion',
        cardType: 'minor',
        name: 'Pinned Version',
        description: '',
        cardJson: {
          id: 'CUSTOM_PinnedVersion',
          name: 'Pinned Version',
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 0,
          desc: [],
          cost: {},
          vp: 0,
          implemented: true,
        },
        effectCode: null,
        compiledCode: null,
        codeManifest: null,
        artUrl: null,
        generation: {},
      },
    }))
    await seedResourceCatalog(db, ['pinned.png'])
    const pinned = (await adoptCandidate(db, {
      cardId: original.id,
      authorId: 'author',
      baseRevision: 1,
      candidate: {
        id: 'art-pinned',
        kind: 'art',
        prompt: 'pinned',
        promptFormat: 'subject',
        resultUrl: '/card-art/pinned.png',
        createdAt: now,
      },
    }))
    const approved = (await approveCurrentDraft(db, { cardId: original.id, authorId: 'author' }))
    expect(approved.versionId).toBe(pinned.versionId)
    // author keeps editing offline; the approval goes stale but the pinned
    // immutable version stays loadable for the author sandbox
    ;(await checkpointDraft(db, {
      cardId: original.id,
      authorId: 'author',
      baseRevision: 2,
      draft: {
        ...pinned.workspace.draft,
        cardId: 'CUSTOM_MutableDraft',
        name: 'Mutable Draft',
        cardJson: {
          ...pinned.workspace.draft.cardJson,
          id: 'CUSTOM_MutableDraft',
          name: 'Mutable Draft',
        },
      },
    }))
    const { handleGameRoute } = await import('../game-router.ts')
    const startRes = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/new-sandbox', {
      seed: 42,
      customCardIds: [original.id],
      customCardVersions: [{
        cardId: original.id,
        versionId: pinned.versionId,
      }],
    }, 'sandbox-token'), startRes)

    expect(startRes.statusCode).toBe(200)
    expect(JSON.parse(startRes.body)).toMatchObject({
      ok: true,
      customCardsLoaded: 1,
      customCardVersionsLoaded: [{
        cardId: original.id,
        versionId: pinned.versionId,
      }],
    })

    const started = JSON.parse(startRes.body)
    expect(started.gameInstanceId).toEqual(expect.any(String))
    const readRes = mockRes()
    await handleGameRoute(mockReq('GET', '/api/game/state', {}, 'sandbox-token'), readRes)
    expect(JSON.parse(readRes.body).gameInstanceId).toBe(started.gameInstanceId)

    const invalidLoadRes = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/load', {}, 'sandbox-token'), invalidLoadRes)
    expect(invalidLoadRes.statusCode).toBe(400)
    const afterInvalidLoad = mockRes()
    await handleGameRoute(mockReq('GET', '/api/game/state', {}, 'sandbox-token'), afterInvalidLoad)
    expect(JSON.parse(afterInvalidLoad.body).gameInstanceId).toBe(started.gameInstanceId)

    const loadRes = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/load', { state: started.state }, 'sandbox-token'), loadRes)
    const loaded = JSON.parse(loadRes.body)
    expect(loaded.ok).toBe(true)
    expect(loaded.gameInstanceId).toEqual(expect.any(String))
    expect(loaded.gameInstanceId).not.toBe(started.gameInstanceId)
    expect(loaded.state.gameSeed).toBe(started.state.gameSeed)

    const drawRes = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/dev/draw-card', {
      playerIndex: 0,
      cardId: 'CUSTOM_PinnedVersion',
    }, 'sandbox-token'), drawRes)
    expect(drawRes.statusCode).toBe(200)

    const defaultStartRes = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/new-sandbox', {
      seed: 42,
      customCardIds: [original.id],
    }, 'sandbox-token'), defaultStartRes)
    expect(defaultStartRes.statusCode).toBe(200)
    const restarted = JSON.parse(defaultStartRes.body)
    expect(restarted.gameInstanceId).not.toBe(started.gameInstanceId)
    expect(restarted.gameInstanceId).not.toBe(loaded.gameInstanceId)
    expect(restarted.state.gameSeed).toBe(started.state.gameSeed)
    const restartedReadRes = mockRes()
    await handleGameRoute(mockReq('GET', '/api/game/state', {}, 'sandbox-token'), restartedReadRes)
    expect(JSON.parse(restartedReadRes.body).gameInstanceId).toBe(restarted.gameInstanceId)
    expect(JSON.parse(defaultStartRes.body)).toMatchObject({
      ok: true,
      customCardsLoaded: 1,
      customCardVersionsLoaded: [],
    })

    const defaultDrawRes = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/dev/draw-card', {
      playerIndex: 0,
      cardId: 'CUSTOM_PinnedVersion',
    }, 'sandbox-token'), defaultDrawRes)
    expect(defaultDrawRes.statusCode).toBe(200)

  })
})
