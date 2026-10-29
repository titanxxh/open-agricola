import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import { createLocalUserForTests } from '../server/auth'
import { getDb } from '../server/db'
import { readSoloDurability } from '../scripts/release/durability'
import { runReleaseSmoke, writeEvidence } from '../scripts/release/smoke'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import { startHostedReleaseApp } from './helpers/hosted-release-app'
import { test } from './server-fixtures'

test('release rehearsal creates and restores both formal solo configurations', async ({ browser }, testInfo) => {
  expect(process.env.DATABASE_SCHEMA).toMatch(/^test_[a-f0-9]{32}$/)
  expect(process.env.S3_PREFIX).toMatch(/^test\/e2e-/)
  const username = `release_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const password = `release-pass-${randomUUID()}`
  const user = await createLocalUserForTests(username, password)
  const hosted = await startHostedReleaseApp({ backendUrl: BACKEND_URL, frontendOrigin: FRONTEND_URL })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const directory = testInfo.outputPath('release-smoke')
  try {
    const evidence = await runReleaseSmoke({ page: await context.newPage(), target: { appUrl: hosted.appUrl, apiUrl: hosted.apiUrl, buildId: hosted.gameBuildId },
      credentials: { username, password }, outputDirectory: directory })
    expect(evidence.ownerId).toBe(user.id)
    const durable = []
    for (const room of evidence.rooms) {
      const proof = await readSoloDurability({ db: getDb(), roomId: room.roomId, ownerId: user.id, mode: room.mode,
        expected: { occupationHand: room.snapshot.occupationHand, minorHand: room.snapshot.minorHand } })
      expect(proof.step0.frameHash).toBe(room.step0Hash)
      expect(proof.hands).toMatchObject({ occupationCount: 7, minorCount: 7, match: true })
      durable.push(proof)
    }
    expect(durable).toHaveLength(2)
    await context.close()
    const retryContext = await browser.newContext()
    try {
      const restored = await runReleaseSmoke({ page: await retryContext.newPage(),
        target: { appUrl: hosted.appUrl, apiUrl: hosted.apiUrl, buildId: hosted.gameBuildId },
        credentials: { username, password }, outputDirectory: directory })
      expect(restored.rooms.map(room => room.roomId)).toEqual(evidence.rooms.map(room => room.roomId))
      expect(restored.logout).toBe(true)
      for (const type of ['createRoom', 'soloHandSubmit', 'parentSubmit', 'takeAction']) {
        expect(restored.commandTypes).not.toContain(type)
      }
    } finally { await retryContext.close() }
    writeEvidence(directory, 'durability.json', { rooms: durable, logout: evidence.logout, build: hosted.gameBuildId })
    await testInfo.attach('release-durability', { path: `${directory}/durability.json`, contentType: 'application/json' })
  } finally {
    await context.close(); await hosted.close()
    await testInfo.attach('release-diagnostics', { path: `${directory}/diagnostics.json`, contentType: 'application/json' })
  }
})

test('release rehearsal preserves the first login failure with sanitized diagnostics', async ({ browser }, testInfo) => {
  expect(process.env.DATABASE_SCHEMA).toMatch(/^test_[a-f0-9]{32}$/)
  const username = `release_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const password = `private-pass-${randomUUID()}`
  const user = await createLocalUserForTests(username, password)
  const hosted = await startHostedReleaseApp({ backendUrl: BACKEND_URL, frontendOrigin: FRONTEND_URL })
  const context = await browser.newContext()
  const directory = testInfo.outputPath('first-failure')
  try {
    await expect(runReleaseSmoke({ page: await context.newPage(),
      target: { appUrl: hosted.appUrl, apiUrl: hosted.apiUrl, buildId: hosted.gameBuildId },
      credentials: { username, password: `${password}-incorrect` }, outputDirectory: directory }))
      .rejects.toThrow('Release smoke failed during login')
    const raw = readFileSync(`${directory}/failure.json`, 'utf8')
    const failure: unknown = JSON.parse(raw)
    expect(failure).toMatchObject({ stage: 'login', errorCategory: 'AssertionError', diagnostics: {
      entries: expect.arrayContaining([expect.objectContaining({ kind: 'response', status: 401 })]),
    } })
    expect(raw).not.toContain(username); expect(raw).not.toContain(password)
    expect(await getDb().prepare('SELECT count(*) AS count FROM rooms WHERE created_by=?').get(user.id)).toEqual({ count: 0 })
    await testInfo.attach('first-failure', { path: `${directory}/failure.json`, contentType: 'application/json' })
  } finally { await context.close(); await hosted.close() }
})
