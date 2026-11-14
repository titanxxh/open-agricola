import * as database from '../db'
import type { QueryResultRow } from 'pg'
import { GameSession } from '../game/authoritative-session'
import { BugReportStore, TokenCipher } from '../bug-report/bug-report-store'
import { handleBugReportRoute } from '../bug-report-routes'
import { createServer, type Server } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { testStorageEnvironment } from './_helpers/objects'
import { ResourceStore } from '../storage/resource-store'
import { S3ObjectStore, objectHash } from '../storage/s3-store'
import { ReplayResources } from '../storage/replay-resources'
import { ReplayStore } from '../game/replay-store'
import { encodeReplayFrame } from '../game/replay-codec'
import { handleReplayRoute, ReplayReadLimiter } from '../replay-routes'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth'
import { PRERELEASE_BUILD_HEADER, PRERELEASE_GENERATION_HEADER } from '../../shared/contract/prerelease-runtime'

const fixture = vi.hoisted(() => {
  const runtime = { buildId: 'a'.repeat(40), generationId: '11111111-2222-4333-8444-555555555555', appOrigin: 'https://pre.example.test',
    formalAppOrigin: 'https://formal.example.test', formalApiBase: 'https://api.example.test', targetId: 'pre' }
  let active = true
  const service = { runtime, resolve: async (token: string) => active && token === 'pre-session' ? { user: { id: 'u1', username: 'u1', displayName: 'One', isAdmin: false }, validUntil: Date.now() + 1000 } : null,
    cachedAuthorized: (token: string) => active && token === 'pre-session', status: () => 'expired' }
  return { runtime, service, authorize(value: boolean) { active = value } }
})
vi.mock('../prerelease-sessions', () => ({ getPrereleaseSessions: () => fixture.service, readPrereleaseRuntime: () => fixture.runtime }))
import { requirePrereleaseRequest } from '../prerelease-routes'

let reportEncryptionAvailable = true
let resources: ReplayResources, store: ReplayStore, server: Server, origin: string, buildId: string, assetHash: string, frameHash: string
const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const headers = () => ({ origin: fixture.runtime.appOrigin, cookie: '__Host-oa-pre-session=pre-session',
  [BROWSER_AUTH_HEADER]: String(BROWSER_AUTH_VERSION), [PRERELEASE_BUILD_HEADER]: fixture.runtime.buildId,
  [PRERELEASE_GENERATION_HEADER]: fixture.runtime.generationId })
const read = (path: string, extra: Record<string, string> = {}) => fetch(origin + path, { headers: { ...headers(), ...extra } })

beforeEach(async () => {
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  fixture.authorize(true)
  reportEncryptionAvailable = true
  const db = await createTestDatabase()
  resources = new ReplayResources(new ResourceStore(db, S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)))
  store = new ReplayStore(db)
  vi.spyOn(database,'getDb').mockReturnValue(db)
  const reports = {db,resources,store:new BugReportStore(db,new TokenCipher('test',new Map([['test',Buffer.alloc(32,7)]]))),delivery:null,github:null}
  const html = Buffer.from('<main>Frozen viewer</main>')
  const manifest = Buffer.from(JSON.stringify({ entrypoint: 'index.html', files: { 'index.html': objectHash(html) }, bridge: { protocolVersion: 1, replaySchemaVersions: [1] } }))
  buildId = objectHash(manifest)
  await resources.storage.stage(`replay-viewers/${buildId}/index.html`, html, 'text/html')
  await resources.publishViewer(buildId, manifest)
  assetHash = objectHash(image)
  await resources.storage.stage(`replay-assets/${assetHash}`, image, 'image/png')
  await resources.storage.reference('replay', 'room-1', [`replay-assets/${assetHash}`])
  await db.prepare("INSERT INTO game_contexts(room_id,lifecycle,replay_status,created_at,updated_at) VALUES ('room-1','completed','available',?,?)").run(Date.now(),Date.now())
  await db.prepare("INSERT INTO game_replays(room_id,schema_version,viewer_build_id,game_build_id,status,latest_step_no,missing_prefix,custom_cards_json,created_at,completed_at) VALUES ('room-1',1,?,?,'completed',0,0,?,?,?)")
    .run(buildId, 'a'.repeat(40), JSON.stringify([{ cardType: 'minor', cardJson: { id: 'CUSTOM_1', name: 'Custom', deck: 'X', number: 1 }, artUrl: `/replay-assets/${assetHash}` }]),Date.now(),Date.now())
  const encoded = encodeReplayFrame({ frame: { round: 1, players: [{ id: 'p1', name: 'One' }], log: [] }, previousFrame: null, stepNo: 0, previousCheckpointStepNo: 0 })
  frameHash = encoded.frameHash
  await db.prepare("INSERT INTO game_replay_steps(room_id,step_no,room_version,checkpoint_step_no,player_index,command_type,intent_json,payload_kind,payload_gzip,frame_hash,created_at) VALUES ('room-1',0,0,0,NULL,'initial','{}',?,?,?,?)")
    .run(encoded.payloadKind, encoded.payloadGzip, encoded.frameHash, Date.now())
  server = createServer((req,res) => { void (async () => {
    if (!await requirePrereleaseRequest(req,res)) return
    if (await handleReplayRoute(req,res,store,{resources,limiter:new ReplayReadLimiter()})) return
    if (await handleBugReportRoute(req,res,reportEncryptionAvailable ? reports : null,{id:'u1',username:'u1',displayName:'One'},false,{db,resources})) return
    res.writeHead(404); res.end()
  })().catch(error => { res.writeHead(500); res.end(String(error)) }) })
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing HTTP fixture')
  origin = `http://127.0.0.1:${address.port}`
  fixture.runtime.appOrigin = `https://127.0.0.1:${address.port}`
})
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs()
  await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()))
  await resources.storage.objects.clearPrefix(); resources.storage.objects.close(); await resources.storage.db.close()
})

describe('private prerelease replay HTTP against PostgreSQL and S3', () => {
  it('reads the bound archive and room-owned image without public caching or conditional/Range bypass', async () => {
    for (const path of ['/manifest','/segments/0',`/anchors/0?frame=${frameHash}`,`/assets/${assetHash}`]) {
      const result = await read('/api/v1/replays/room-1'+path, { 'if-none-match': '*', range: 'bytes=0-3' })
      expect(result.status,path).toBe(200)
      expect(result.headers.get('cache-control')).toBe('no-store')
      expect(result.headers.get('etag')).toBeNull()
      expect(result.headers.get('access-control-allow-origin')).toBeNull()
      if (path.startsWith('/assets')) expect(Buffer.from(await result.arrayBuffer())).toEqual(image)
      else expect(await result.json()).toMatchObject({ ok: true, roomId: 'room-1', viewerBuildId: buildId })
    }
    expect((await read(`/replay-assets/${assetHash}`)).status).toBe(403)
    await resources.storage.reference('replay','room-2',[`replay-assets/${assetHash}`])
    await resources.storage.release('replay','room-1')
    expect((await read(`/api/v1/replays/room-1/assets/${assetHash}`)).status).toBe(403)
  })

  it('rejects unauthenticated, wrong build/generation and revoked requests before any resource read', async () => {
    const spy = vi.spyOn(resources.storage,'read')
    for (const extra of [{cookie:''},{[PRERELEASE_BUILD_HEADER]:'b'.repeat(40)},{[PRERELEASE_GENERATION_HEADER]:'99999999-2222-4333-8444-555555555555'}]) {
      const result = await read(`/api/v1/replays/room-1/assets/${assetHash}`, {...extra,'if-none-match':'*',range:'bytes=0-3'})
      expect([401,426]).toContain(result.status)
      expect(result.headers.get('cache-control')).toBe('no-store')
    }
    fixture.authorize(false)
    expect((await read('/api/v1/replays/room-1/manifest')).status).toBe(403)
    expect(spy).not.toHaveBeenCalled()
  })

  it('suppresses a slow S3 success when the source is revoked before bytes leave', async () => {
    let entered = () => {}, release = () => {}
    const reached = new Promise<void>(resolve => { entered = resolve })
    const wait = new Promise<void>(resolve => { release = resolve })
    const original = resources.storage.objects.get.bind(resources.storage.objects)
    vi.spyOn(resources.storage.objects,'get').mockImplementation(async key => {
      const result = await original(key)
      if (key === `replay-assets/${assetHash}`) { entered(); await wait }
      return result
    })
    const pending = read(`/api/v1/replays/room-1/assets/${assetHash}`)
    await reached
    fixture.authorize(false)
    release()
    const result = await pending
    expect(result.status).toBe(403)
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect(await result.json()).toEqual({ ok:false, code:'prerelease_access_expired' })
  })

  it('refuses an old frozen viewer without bridge support and retains the original objects', async () => {
    const html = Buffer.from('<main>Old viewer</main>')
    const bytes = Buffer.from(JSON.stringify({entrypoint:'index.html',files:{'index.html':createHash('sha256').update(html).digest('hex')}}))
    const oldBuild = objectHash(bytes)
    await resources.storage.stage(`replay-viewers/${oldBuild}/index.html`,html,'text/html')
    await resources.publishViewer(oldBuild,bytes)
    await resources.storage.db.prepare("UPDATE game_replays SET viewer_build_id = ? WHERE room_id = 'room-1'").run(oldBuild)
    const result = await read('/api/v1/replays/room-1/manifest')
    expect(result.status).toBe(503)
    expect(await result.json()).toMatchObject({ok:false,code:'viewer_unavailable'})
    expect((await resources.storage.read(`replay-viewers/${oldBuild}/index.html`))?.body).toEqual(html)
  })
  it.each([true,false])('keeps Evidence Anchor, participant and expiry checks with report encryption %s', async encrypted => {
    reportEncryptionAvailable = encrypted
    const db = resources.storage.db, now = Date.now()
    await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES ('u1','u1','One','hash',?)").run(now)
    await db.prepare("INSERT INTO rooms(id,created_by,state_json,status,version,created_at,updated_at) VALUES ('room-1','u1','{}','playing',0,?,?)").run(now,now)
    await db.prepare("INSERT INTO room_players(room_id,user_id,player_index,joined_at) VALUES ('room-1','u1',0,?)").run(now)
    await db.prepare("UPDATE game_contexts SET lifecycle='active' WHERE room_id='room-1'").run()
    const session = new GameSession(42,undefined,{playerCount:2})
    const encoded = encodeReplayFrame({frame:JSON.parse(JSON.stringify(session.buildSyncPayload(session.getState(),[],'debug').state)),previousFrame:null,stepNo:0,previousCheckpointStepNo:0})
    session.dispose()
    await db.prepare("UPDATE game_replay_steps SET payload_kind=?,payload_gzip=?,frame_hash=? WHERE room_id='room-1'").run(encoded.payloadKind,encoded.payloadGzip,encoded.frameHash)
    await db.prepare("INSERT INTO bug_reports(submission_id,reporter_user_id,room_id,player_index,lifecycle,room_version,step_no,frame_hash,status,submitted_at,evidence_expires_at,created_at,updated_at) VALUES ('reported','u1','room-1',0,'active',0,0,?,'submitted',?,?,?,?)")
      .run(encoded.frameHash,now,now+60_000,now,now)
    const evidence = await read(`/api/v1/game-contexts/room-1/evidence/0?frame=${encoded.frameHash}`)
    expect(evidence.status).toBe(200)
    expect(await evidence.json()).toMatchObject({ok:true,kind:'reportedEvidence',perspective:'p1'})
    const path = `/api/v1/game-contexts/room-1/evidence/0/assets/${assetHash}?frame=${encoded.frameHash}`
    const response = await read(path,{'if-none-match':'*',range:'bytes=0-1'})
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(image)
    const prepare = db.prepare.bind(db)
    for (const fault of ['deadline','seat','anchor','removed'] as const) {
      const delayed = vi.spyOn(db,'prepare').mockImplementation(sql => {
        const statement = prepare(sql)
        if (sql.includes('SELECT step_no, checkpoint_step_no, payload_kind, payload_gzip, frame_hash')) {
          const all = statement.all
          statement.all = async <Row extends QueryResultRow = QueryResultRow>(...values: unknown[]): Promise<Row[]> => {
            const rows = await all<Row>(...values)
            if (fault === 'deadline') await prepare("UPDATE bug_reports SET evidence_expires_at=0 WHERE submission_id='reported'").run()
            if (fault === 'seat') await prepare("DELETE FROM room_players WHERE room_id='room-1'").run()
            if (fault === 'anchor') await prepare("UPDATE bug_reports SET submitted_at=NULL WHERE submission_id='reported'").run()
            if (fault === 'removed') await prepare("UPDATE game_contexts SET lifecycle='removed' WHERE room_id='room-1'").run()
            return rows
          }
        }
        return statement
      })
      const changedDuringRead = await read(`/api/v1/game-contexts/room-1/evidence/0?frame=${encoded.frameHash}`)
      delayed.mockRestore()
      const expected = {deadline:{status:503,code:'replay_segment_unavailable'},seat:{status:403,code:'not_participant'},anchor:{status:409,code:'anchor_mismatch'},removed:{status:410,code:'context_removed'}}[fault]
      expect(changedDuringRead.status,fault).toBe(expected.status)
      expect(await changedDuringRead.json()).toMatchObject({ok:false,code:expected.code})
      await db.prepare("UPDATE bug_reports SET evidence_expires_at=?,submitted_at=? WHERE submission_id='reported'").run(now+60_000,now)
      await db.prepare("UPDATE game_contexts SET lifecycle='active' WHERE room_id='room-1'").run()
      if (fault === 'seat') await db.prepare("INSERT INTO room_players(room_id,user_id,player_index,joined_at) VALUES ('room-1','u1',0,?)").run(now)
    }
    const readAsset=resources.asset.bind(resources)
    const removedAfterRead=vi.spyOn(resources,'asset').mockImplementation(async (...args)=>{
      const object=await readAsset(...args)
      await resources.storage.release('replay','room-1')
      return object
    })
    const erasedImage=await read(path)
    removedAfterRead.mockRestore()
    expect(erasedImage.status).toBe(503)
    expect(await erasedImage.json()).toMatchObject({ok:false,code:'replay_segment_unavailable'})
    expect((await read(path.replace(encoded.frameHash,'0'.repeat(64)))).status).toBe(409)
    expect((await read('/api/v1/replays/room-1/manifest')).status).toBe(409)
    await db.prepare("UPDATE bug_reports SET submitted_at=NULL WHERE submission_id='reported'").run()
    expect((await read(path)).status).toBe(409)
    await db.prepare("UPDATE bug_reports SET submitted_at=?,evidence_expires_at=0 WHERE submission_id='reported'").run(now)
    expect((await read(path)).status).toBe(503)
    await db.prepare("UPDATE bug_reports SET evidence_expires_at=? WHERE submission_id='reported'").run(now+60_000)
    await db.prepare("DELETE FROM room_players WHERE room_id='room-1'").run()
    expect((await read(path)).status).toBe(403)
  })

  it.each(['corrupt','removed'])('refuses %s referenced image bytes before conditional responses', async mode => {
    const key = `replay-assets/${assetHash}`
    if (mode === 'corrupt') {
      const current = await resources.storage.objects.get(key)
      if (!current) throw new Error('fixture image missing')
      await resources.storage.objects.replace(key,Buffer.from('tampered'),current.etag)
    } else {
      await resources.storage.ledger.append({version:1,entries:[],assetTakedowns:[{hash:assetHash,reason:'moderation',removedAt:Date.now()}]})
      await resources.storage.blockHash(assetHash)
    }
    const result = await read(`/api/v1/replays/room-1/assets/${assetHash}`,{'if-none-match':'*',range:'bytes=0-1'})
    expect(result.status).toBe(mode === 'corrupt' ? 503 : 403)
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect(result.headers.get('etag')).toBeNull()
    expect(await result.text()).not.toContain(image.toString())
  })

  it('denies image bytes removed after their S3 read while the final archive fence is pending', async () => {
    const original=store.archiveUnavailable.bind(store)
    vi.spyOn(store,'archiveUnavailable').mockImplementation(async roomId=>{
      const result=await original(roomId)
      await resources.storage.ledger.append({version:1,entries:[],assetTakedowns:[{hash:assetHash,reason:'moderation',removedAt:Date.now()}]})
      await resources.storage.blockHash(assetHash)
      return result
    })
    const response=await read(`/api/v1/replays/room-1/assets/${assetHash}`)
    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ok:false,code:'not_participant'})
  })

  it('rechecks the original archive deadline after a slow image read', async () => {
    const original = resources.storage.objects.get.bind(resources.storage.objects)
    vi.spyOn(resources.storage.objects,'get').mockImplementation(async key => {
      const object = await original(key)
      if (key === `replay-assets/${assetHash}`) await resources.storage.db.prepare("UPDATE game_replays SET completed_at=? WHERE room_id='room-1'").run(Date.now()-30*86_400_000)
      return object
    })
    const result = await read(`/api/v1/replays/room-1/assets/${assetHash}`)
    expect(result.status).toBe(410)
    expect(await result.json()).toMatchObject({ok:false,code:'context_expired'})
  })

})
