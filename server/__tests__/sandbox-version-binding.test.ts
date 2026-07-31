import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

type MockRes = ServerResponse & { statusCode: number; body: string }

const originalDbPath = process.env.DB_PATH
let tempDir = ''

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

afterEach(() => {
  if (originalDbPath === undefined) delete process.env.DB_PATH
  else process.env.DB_PATH = originalDbPath
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  vi.resetModules()
})

describe('sandbox version binding', () => {
  it('loads the requested immutable workshop version instead of the mutable draft', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'open-agricola-sandbox-version-'))
    process.env.DB_PATH = join(tempDir, 'sandbox.db')
    vi.resetModules()
    const { getDb } = await import('../db.ts')
    const {
      adoptCandidate,
      checkpointDraft,
      createCard,
      approveCurrentDraft,
    } = await import('../workshop-drafts.ts')
    const db = getDb()
    const now = Date.now()
    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, created_at)
      VALUES ('author', 'sandbox_author', 'Sandbox Author', 'x', ?)
    `).run(now)
    db.prepare(`
      INSERT INTO sessions (token, user_id, expires_at, created_at)
      VALUES ('sandbox-token', 'author', ?, ?)
    `).run(now + 3_600_000, now)
    const original = createCard(db, {
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
    })
    const pinned = adoptCandidate(db, {
      cardId: original.id,
      authorId: 'author',
      baseRevision: 1,
      candidate: {
        id: 'art-pinned',
        kind: 'art',
        prompt: 'pinned',
        resultUrl: '/card-art/pinned.png',
        createdAt: now,
      },
    })
    const approved = approveCurrentDraft(db, { cardId: original.id, authorId: 'author' })
    expect(approved.versionId).toBe(pinned.versionId)
    // author keeps editing offline; the approval goes stale but the pinned
    // immutable version stays loadable for the author sandbox
    checkpointDraft(db, {
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
    })
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
    db.close()
  })
})
