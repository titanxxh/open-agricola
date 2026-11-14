import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, expect, it, vi } from 'vitest'
import { createTestDatabase, getTestDatabaseUrl } from '../../__tests__/_helpers/postgres'
import { testStorageEnvironment } from '../../__tests__/_helpers/objects'
import { S3ObjectStore, objectHash } from '../../storage/s3-store'
import { ResourceStore } from '../../storage/resource-store'
import { GameContextStore } from '../game-context-store'
import { applyReplayRemovalLedger, expirePrereleaseReplay } from '../replay-removal'
import { PRERELEASE_ARCHIVE_RETENTION_MS } from '../prerelease-archive-retention'
import { collectPrereleaseArchives, retireUnusedPrereleaseViewers } from '../prerelease-archive-cleanup'
import { ReplayResources } from '../../storage/replay-resources'
import { withResourceCapture } from '../../storage/backup-coordination'

const db = await createTestDatabase()
const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
const resources = new ResourceStore(db, objects)
afterAll(async () => { await objects.clearPrefix(); objects.close(); await db.close() })
afterEach(() => vi.unstubAllEnvs())

async function archive(target: typeof db, roomId: string, finishedAt: number, artHash: string | null = null) {
  await target.prepare(`INSERT INTO game_contexts(room_id,lifecycle,replay_status,created_at,updated_at)
    VALUES (?,'completed','available',1,1)`).run(roomId)
  await target.prepare(`INSERT INTO game_results(room_id,started_at,finished_at,rounds_played,player_count,
    enable_community_deck,enable_parent_cards,enable_through_the_seasons,enable_farmers_of_the_moor,enable_snake_opening)
    VALUES (?,1,?,14,2,0,0,0,0,0)`).run(roomId, finishedAt)
  await target.prepare(`INSERT INTO game_result_players(room_id,player_index,game_player_id,display_name,score)
    VALUES (?,0,'p1','Private name',42)`).run(roomId)
  await target.prepare(`INSERT INTO game_replays(room_id,schema_version,viewer_build_id,game_build_id,status,latest_step_no,missing_prefix,custom_cards_json,created_at,completed_at)
    VALUES (?,1,?,'game','completed',0,0,?,1,?)`).run(roomId, 'a'.repeat(64), JSON.stringify(artHash ? [{ cardType: 'minor', cardJson: { id: 'CUSTOM_Shared' }, artUrl: `/replay-assets/${artHash}` }] : []), finishedAt)
  await target.prepare(`INSERT INTO game_replay_steps(room_id,step_no,room_version,checkpoint_step_no,command_type,intent_json,payload_kind,payload_gzip,frame_hash,created_at)
    VALUES (?,0,0,0,'initial','{}','checkpoint',?, ?,1)`).run(roomId, Buffer.from('private frame'), 'b'.repeat(64))
}

it('durably expires only due pre archives and keeps an image referenced by a newer archive', async () => {
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  const image = Buffer.from('shared archive image'), hash = objectHash(image)
  await resources.stage(`replay-assets/${hash}`, image, 'image/png')
  await archive(db, 'due-pre-archive', 1_000, hash)
  await archive(db, 'new-pre-archive', 2_000, hash)
  const now = 1_000 + PRERELEASE_ARCHIVE_RETENTION_MS
  expect(await expirePrereleaseReplay(db, { roomId: 'new-pre-archive', resources, now: () => now })).toBe(false)
  expect(await expirePrereleaseReplay(db, { roomId: 'due-pre-archive', resources, now: () => now })).toBe(true)
  expect(await db.prepare('SELECT room_id FROM game_results ORDER BY room_id').all()).toEqual([{ room_id: 'new-pre-archive' }])
  expect(await db.prepare('SELECT room_id FROM game_result_players ORDER BY room_id').all()).toEqual([{ room_id: 'new-pre-archive' }])
  expect(await db.prepare('SELECT room_id FROM game_replays ORDER BY room_id').all()).toEqual([{ room_id: 'new-pre-archive' }])
  expect(await new GameContextStore(db).resolve('due-pre-archive')).toMatchObject({ ok: true, lifecycle: 'removed' })
  expect(await resources.read(`replay-assets/${hash}`)).toMatchObject({ body: image })
  expect((await resources.ledger.read()).flatMap(batch => batch.entries)).toMatchObject([{ roomId: 'due-pre-archive', reason: 'removed', eraseResult: true }])
  await expirePrereleaseReplay(db, { roomId: 'due-pre-archive', resources, now: () => now })
  expect((await resources.ledger.read()).flatMap(batch => batch.entries)).toHaveLength(1)
})

it('applies the current independent expiry ledger to an isolated old archive without reviving its result or identity', async () => {
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  await archive(db, 'old-backup-archive', 1_000)
  await expirePrereleaseReplay(db, { roomId: 'old-backup-archive', resources, now: () => 1_000 + PRERELEASE_ARCHIVE_RETENTION_MS })
  const restored = await createTestDatabase()
  const restoredObjects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
  try {
    const restoredResources = new ResourceStore(restored, restoredObjects)
    const currentLedger = await objects.get('erasure/ledger.json')
    if (!currentLedger) throw new Error('Missing current independent ledger')
    await restoredObjects.putImmutable('erasure/ledger.json', currentLedger.body, 'application/json')
    await archive(restored, 'old-backup-archive', 1_000)
    await applyReplayRemovalLedger(restored, { resources: restoredResources })
    expect(await restored.prepare('SELECT room_id FROM game_results').all()).toEqual([])
    expect(await restored.prepare('SELECT display_name FROM game_result_players').all()).toEqual([])
    expect(await restored.prepare('SELECT room_id FROM game_replay_steps').all()).toEqual([])
    expect(await new GameContextStore(restored).resolve('old-backup-archive')).toMatchObject({ lifecycle: 'removed' })
    expect(await db.prepare('SELECT room_id FROM game_results WHERE room_id=?').get('old-backup-archive')).toBeUndefined()
    expect((await objects.get('erasure/ledger.json'))?.body).toEqual(currentLedger.body)
  } finally { await restoredObjects.clearPrefix(); restoredObjects.close(); await restored.close() }
})

it('keeps installed and retained Viewer programs and releases only the last unreferenced build', async () => {
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  async function viewer(title: string) {
    const body = Buffer.from(`<title>${title}</title>`)
    const manifest = Buffer.from(JSON.stringify({ entrypoint: 'index.html', files: { 'index.html': objectHash(body) } }))
    const id = objectHash(manifest)
    await resources.stage(`replay-viewers/${id}/index.html`, body, 'text/html')
    await new ReplayResources(resources).publishViewer(id, manifest)
    return id
  }
  const installed = await viewer('installed'), retained = await viewer('retained'), unused = await viewer('unused')
  await archive(db, 'viewer-retained-archive', 2_000)
  await db.prepare('UPDATE game_replays SET viewer_build_id=? WHERE room_id=?').run(retained, 'viewer-retained-archive')
  expect(await retireUnusedPrereleaseViewers(resources, installed)).toEqual([unused])
  expect(await resources.read(`replay-viewers/${installed}/index.html`)).not.toBeNull()
  expect(await resources.read(`replay-viewers/${retained}/index.html`)).not.toBeNull()
  expect(await resources.read(`replay-viewers/${unused}/index.html`)).toBeNull()
  const collected = await collectPrereleaseArchives(db, resources, installed, () => 2_000 + PRERELEASE_ARCHIVE_RETENTION_MS)
  expect(collected.roomIds).toContain('viewer-retained-archive')
  expect(collected.viewerBuildIds).toContain(retained)
  expect(await resources.read(`replay-viewers/${installed}/index.html`)).not.toBeNull()
  expect(await resources.read(`replay-viewers/${retained}/index.html`)).toBeNull()
})

it('retains unfinished exact Evidence and active recording dependencies until their own references end', async () => {
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  async function viewer(title: string) {
    const body = Buffer.from(`<title>${title}</title>`)
    const manifest = Buffer.from(JSON.stringify({ entrypoint: 'index.html', files: { 'index.html': objectHash(body) } }))
    const id = objectHash(manifest)
    await resources.stage(`replay-viewers/${id}/index.html`, body, 'text/html')
    await new ReplayResources(resources).publishViewer(id, manifest)
    return id
  }
  const installed = await viewer('installed-evidence'), evidence = await viewer('evidence'), active = await viewer('active')
  await archive(db, 'unfinished-evidence', 1)
  await archive(db, 'active-recording', 1)
  await db.prepare("UPDATE game_contexts SET lifecycle='expired' WHERE room_id='unfinished-evidence'").run()
  await db.prepare("UPDATE game_contexts SET lifecycle='active',phase='playing' WHERE room_id='active-recording'").run()
  await db.prepare('UPDATE game_replays SET viewer_build_id=? WHERE room_id=?').run(evidence, 'unfinished-evidence')
  await db.prepare('UPDATE game_replays SET viewer_build_id=? WHERE room_id=?').run(active, 'active-recording')
  await db.prepare(`INSERT INTO bug_reports(submission_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,
    evidence_expires_at,submitted_at,created_at,updated_at) VALUES ('exact-evidence','unfinished-evidence',0,'active',0,0,?,?,1,1,1)`)
    .run('b'.repeat(64), Date.now() + 60_000)
  const retired = await retireUnusedPrereleaseViewers(resources, installed)
  expect(retired).not.toContain(evidence)
  expect(retired).not.toContain(active)
  expect(await resources.read(`replay-viewers/${evidence}/index.html`)).not.toBeNull()
  expect(await resources.read(`replay-viewers/${active}/index.html`)).not.toBeNull()
  await db.prepare("UPDATE bug_reports SET frame_hash=? WHERE submission_id='exact-evidence'").run('c'.repeat(64))
  expect(await retireUnusedPrereleaseViewers(resources, installed)).toContain(evidence)
  expect(await resources.read(`replay-viewers/${active}/index.html`)).not.toBeNull()
})

it('commits expiry facts before a failed database deletion and safely retries the same erasure', async () => {
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  const roomId = 'partial-expiry'
  await archive(db, roomId, 1_000)
  await db.exec(`CREATE FUNCTION reject_partial_expiry() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF OLD.room_id='partial-expiry' THEN RAISE EXCEPTION 'retryable expiry deletion'; END IF; RETURN OLD; END;
    $$;
    CREATE TRIGGER reject_partial_expiry BEFORE DELETE ON game_results FOR EACH ROW EXECUTE FUNCTION reject_partial_expiry();`)
  const now = () => 1_000 + PRERELEASE_ARCHIVE_RETENTION_MS
  try {
    await expect(expirePrereleaseReplay(db, { roomId, resources, now })).rejects.toThrow('retryable expiry deletion')
    expect(await db.prepare('SELECT score FROM game_result_players WHERE room_id=?').get(roomId)).toEqual({ score: 42 })
    expect(await new GameContextStore(db, now).resolve(roomId)).toMatchObject({ lifecycle: 'expired' })
    expect((await resources.ledger.read()).flatMap(batch => batch.entries).filter(entry => entry.roomId === roomId)).toHaveLength(1)
  } finally { await db.exec('DROP TRIGGER reject_partial_expiry ON game_results; DROP FUNCTION reject_partial_expiry()') }
  expect(await expirePrereleaseReplay(db, { roomId, resources, now })).toBe(true)
  expect(await db.prepare('SELECT 1 FROM game_result_players WHERE room_id=?').get(roomId)).toBeUndefined()
  expect((await resources.ledger.read()).flatMap(batch => batch.entries).filter(entry => entry.roomId === roomId)).toHaveLength(1)
})

it('removes online archive access while a real backup lock protects its final image bytes', async () => {
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  const image = Buffer.from('backup-protected final archive image'), hash = objectHash(image), roomId = 'protected-expiry'
  await resources.stage(`replay-assets/${hash}`, image, 'image/png')
  await archive(db, roomId, 1_000, hash)
  const schema = await db.prepare('SELECT current_schema() AS name').get<{ name: string }>()
  if (!schema) throw new Error('Missing private schema')
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const capture = withResourceCapture({ connectionString: getTestDatabaseUrl(), schema: schema.name, buildId: 'expiry-capture',
    deadlineEpochMs: Date.now() + 20_000, signal: new AbortController().signal }, async view => {
    entered.resolve(); await release.promise; return view
  })
  try {
    await entered.promise
    expect(await expirePrereleaseReplay(db, { roomId, resources, now: () => 1_000 + PRERELEASE_ARCHIVE_RETENTION_MS })).toBe(true)
    expect(await new GameContextStore(db).resolve(roomId)).toMatchObject({ lifecycle: 'removed' })
    expect((await objects.get(`replay-assets/${hash}`))?.body).toEqual(image)
    expect(await resources.removeUnreferenced([`replay-assets/${hash}`])).toEqual([])
  } finally { release.resolve(); await capture }
  expect(await resources.removeUnreferenced([`replay-assets/${hash}`])).toEqual([`replay-assets/${hash}`])
  expect(await objects.get(`replay-assets/${hash}`)).toBeNull()
})
