import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../db'
import { createLocalUserForTests } from '../../auth'
import { PostgresRoomPersistence } from '../../game/persistence/postgres-adapter'
import { CommandStore } from '../../game/command-store'
import { decodeReplayFrame } from '../../game/replay-codec'
import { SoloNetworkPeer, startFormalSoloBackend } from '../../__tests__/_helpers/formal-solo-network'
import { createScenarioEvidence } from '../../__tests__/_helpers/scenario-evidence'
import type { SoloHandMode } from '../../../shared/contract/game-creation'
import type { SoloHandSelectionGroup } from '../../../shared/contract/solo-hand-selection'
import { isFatherParentCardId, isMotherParentCardId } from '../../../shared/parents/ids'

vi.mock('../../db.ts', async () => {
  const { createTestDatabase } = await import('../../__tests__/_helpers/postgres')
  const db = await createTestDatabase()
  return { getDb: () => db }
})

const evidence = createScenarioEvidence(import.meta.url)
const source = { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), node: process.version }
let backend: Awaited<ReturnType<typeof startFormalSoloBackend>> | undefined
beforeAll(async () => { backend = await startFormalSoloBackend(getDb()) }, 120_000)
afterAll(async () => {
  try { await backend?.close() } finally { await getDb().close() }
}, 120_000)

type Configuration = { label: string; moor: boolean; seasons: boolean; parents: boolean; mode: SoloHandMode }
const modes: SoloHandMode[] = ['random', 'choose-7']
const configurations: Configuration[] = [0, 1, 2, 3, 4, 5, 6, 7].flatMap(mask => modes.map(mode => ({
  label: `${mask & 1 ? 'Moor+' : ''}${mask & 2 ? 'Seasons+' : ''}${mask & 4 ? 'Parents+' : ''}solo/${mode}`,
  moor: Boolean(mask & 1), seasons: Boolean(mask & 2), parents: Boolean(mask & 4), mode,
})))
const manifest: Record<string, { meta: { type: string; playerActionCardType?: string; deck: string; players?: string } }> = JSON.parse(readFileSync('public/cards-manifest.json', 'utf8'))
const checkCards = (ids: string[], type: 'minor' | 'occupation') => {
  expect(new Set(ids).size).toBe(ids.length)
  for (const id of ids) {
    const card = manifest[id]?.meta
    expect(card, id).toBeDefined()
    expect(card!.type === 'playerAction' ? card!.playerActionCardType : card!.type).toBe(type)
    expect(card!.players ?? '1+').not.toMatch(/^[2-6]/)
    expect(['A', 'B', 'C', 'D', 'E', ...(type === 'minor' ? ['M'] : [])]).toContain(card!.deck)
  }
}

describe('formal solo creation over the real network', () => {
  it.each(configurations)('$label commits Step 0 and enters work with one owned seat', async configuration => {
    if (!backend) throw new Error('Backend did not start')
    const username = `solo_matrix_${randomUUID().slice(0, 8)}`
    const user = await createLocalUserForTests(username, 'password123', 'Solo matrix')
    const login = await fetch(`${backend.baseUrl}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'password123' }),
    })
    expect(login.status).toBe(200)
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    expect(cookie.startsWith('oa_session=')).toBe(true)
    const allocationId = randomUUID()
    const locate = await fetch(`${backend.baseUrl}/api/rooms/locate`, { method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ allocationId }),
    })
    expect(locate.status, await locate.clone().text()).toBe(200)
    const route: { allocationId: string; wsPath: string } = await locate.json()
    expect(route.allocationId).toBe(allocationId)
    expect(route.wsPath).toMatch(/^\/nodes\/[a-f0-9-]+\/ws$/)
    const peer = await SoloNetworkPeer.connect(`${backend.baseUrl.replace('http:', 'ws:')}/ws`, cookie)
    let roomId: string | undefined
    try {
      const draftParents = configuration.parents && configuration.mode === 'choose-7'
      const options = { maxPlayers: 1, soloHandMode: configuration.mode, enableFarmersOfTheMoor: configuration.moor,
        enableThroughTheSeasons: configuration.seasons, enableParentCards: configuration.parents, draftParents,
        enableCommunityDeck: false, customCardIds: [],
      }
      const creation = await peer.mutate({ type: 'createRoom', ...options }, undefined, allocationId)
      let state = creation.state
      roomId = state.roomId
      expect(roomId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
      expect(state.version).toBe(0)
      expect(creation.receipt.outcome).toMatchObject({ ok: true, roomId, roomVersion: 0, stepNo: 0 })
      expect(await new CommandStore(getDb()).lookup(`user:${user.id}`, creation.identity))
        .toEqual({ kind: 'completed', receipt: creation.receipt })
      const persistence = new PostgresRoomPersistence(getDb())
      const initial = await persistence.load(roomId)
      expect(initial?.meta).toMatchObject({ maxPlayers: 1, status: 'playing', players: [{ userId: user.id, playerIndex: 0 }] })
      expect(initial!.serialized!.state.players).toHaveLength(1)
      const step0 = await getDb().prepare('SELECT command_type, payload_kind, payload_gzip, checkpoint_step_no, frame_hash FROM game_replay_steps WHERE room_id=? AND step_no=0')
        .get<{ command_type: string; payload_kind: 'checkpoint' | 'delta'; payload_gzip: Buffer; checkpoint_step_no: number; frame_hash: string }>(roomId)
      expect(step0).toMatchObject({ command_type: 'initial', payload_kind: 'checkpoint', checkpoint_step_no: 0, frame_hash: creation.receipt.outcome.frameHash })
      const frame = decodeReplayFrame(null, { payloadKind: step0!.payload_kind, payloadGzip: step0!.payload_gzip,
        checkpointStepNo: step0!.checkpoint_step_no, frameHash: step0!.frame_hash })
      expect(frame).toMatchObject({ players: [{ id: 'p1' }], phase: configuration.mode === 'choose-7' ? 'solo-hand-selection' : 'playing' })
      expect(await persistence.loadCreationConfiguration(roomId)).toEqual({ configuration: {
        kind: 'standard-solo', officialCardPool: 'default-implemented-A-E', ...options,
      }, resolvedWorkshopSources: [] })
      let candidates: SoloHandSelectionGroup[] = []
      if (configuration.mode === 'choose-7') {
        expect(state.inputWindow?.kind).toBe('solo-hand')
        expect(state.payload.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'solo-hand-selection' } })
        candidates = state.payload.state.soloHandSelection!.groups
        expect(candidates.map(group => [group.kind, group.cardIds.length, group.keepCount])).toEqual(configuration.moor
          ? [['occupation', 10, 7], ['minor', 4, 3], ['moor-minor', 6, 4]] : [['occupation', 10, 7], ['minor', 10, 7]])
        for (const group of candidates) checkCards(group.cardIds, group.kind === 'occupation' ? 'occupation' : 'minor')
        const selection = { groups: candidates.map(group => ({ kind: group.kind, cardIds: group.cardIds.slice(0, group.keepCount) })) }
        state = (await peer.mutate({ type: 'soloHandSubmit', playerIndex: 0, selection }, state)).state
      }
      if (draftParents) {
        expect(state.payload.state.phase).toBe('parent-selection')
        expect(state.inputWindow?.kind).toBe('parent')
        const candidates = state.payload.state.parentSelection!.candidates.p1
        expect(candidates.mother).toHaveLength(2)
        expect(candidates.father).toHaveLength(2)
        const mother = candidates.mother[0]
        const father = candidates.father[0]
        if (!mother || !father || !isMotherParentCardId(mother) || !isFatherParentCardId(father)) throw new Error('Owner parent candidates were masked')
        state = (await peer.mutate({ type: 'parentSubmit', playerIndex: 0,
          selection: { mother, father },
        }, state)).state
      }
      for (let step = 0; step < 8 && state.payload.interaction.stateId === 'wait'; step++) {
        const interaction = state.payload.interaction
        if (interaction.stateId !== 'wait') throw new Error('Opening interaction changed')
        const request = interaction.request
        let value: string | undefined
        if (request.kind === 'select-trigger' && interaction.spaceId === '__stage:onRoundStart') {
          for (const option of request.options.filter(option => !option.disabled)) {
            if (!['PR10', 'PR11', 'PR12', 'E096_Elder'].includes(option.sourceCard ?? '') && option.value !== '__pass__' && option.labelKey !== 'actions.exchange.name') {
              throw new Error(`Unknown opening source: ${JSON.stringify(option)}`)
            }
          }
          value = request.options.find(option => ['PR10', 'PR11', 'PR12'].includes(option.sourceCard ?? '') && !option.disabled)?.value
            ?? request.options.find(option => option.value === '__pass__' && !option.disabled)?.value
        } else if (request.kind === 'choice' && interaction.sourceCard === 'E096_Elder') {
          value = request.options.find(option => option.value === '__skip__' && !option.disabled)?.value
        }
        if (!value) throw new Error(`Unknown opening pending: ${JSON.stringify(interaction)}`)
        state = (await peer.mutate({ type: 'choice', value }, state)).state
      }
      expect(state.payload.state).toMatchObject({ phase: 'playing', roundPhase: 'work', round: 1, gameOver: false })
      expect(state.payload.interaction.stateId).toBe('idle')
      const players = state.payload.state.players
      expect(players).toHaveLength(1)
      expect(players[0]!.occupationHand).toHaveLength(7)
      expect(players[0]!.minorHand).toHaveLength(7)
      checkCards(players[0]!.occupationHand, 'occupation')
      checkCards(players[0]!.minorHand, 'minor')
      expect(players[0]!.minorHand.filter(id => id.startsWith('M'))).toHaveLength(configuration.moor ? 4 : 0)
      expect(players[0]!.resources.food).toBe(players[0]!.parentCards.mother === 'PR11' ? 1 : 0)
      const persisted = await persistence.load(roomId)
      expect(persisted!.serialized!.state.players[0]!.minorHand).toEqual(players[0]!.minorHand)
      for (const group of candidates) for (const id of group.cardIds) {
        expect(persisted!.serialized!.state.ordinaryCardDecks[group.kind === 'occupation' ? 'occupation' : 'minor']).not.toContain(id)
      }
      if (configuration.moor) {
        const privateCards = persisted!.serialized!.state.farmersOfTheMoor!.specialActionCards
        expect(privateCards).toHaveLength(10)
        expect(privateCards.filter(card => card.location.kind === 'solo-current')).toHaveLength(1)
        const hidden = privateCards.filter(card => card.location.kind === 'solo-draw')
        expect(hidden).toHaveLength(9)
        expect(state.payload.state.farmersOfTheMoor!.specialActionCards).toHaveLength(1)
        expect(state.payload.state.farmersOfTheMoor!.soloSupply).toMatchObject({ drawCount: 9, retentionPaid: false })
        for (const card of hidden) expect(JSON.stringify(state.payload)).not.toContain(card.id)
      }
      const mine: { ok: boolean; rooms: Array<{ id: string; max_players: number; player_index: number }> } = await (await fetch(`${backend.baseUrl}/api/lobby/my-rooms`, { headers: { Cookie: cookie } })).json()
      expect(mine).toMatchObject({ ok: true, rooms: [{ id: roomId, max_players: 1, player_index: 0 }] })
      const publicRooms: { ok: boolean; rooms: Array<{ id: string }> } = await (await fetch(`${backend.baseUrl}/api/rooms`)).json()
      expect(publicRooms).toEqual({ ok: true, rooms: [] })
      expect(await getDb().prepare('SELECT count(*) AS count FROM game_replay_steps WHERE room_id=? AND step_no=0').get(roomId)).toEqual({ count: 1 })
    } finally {
      evidence.record('source', { ...source, schema: backend.schema, s3Prefix: backend.prefix,
        processId: backend.processId, viewerBuildId: backend.buildId })
      evidence.record('formal-network-opening', { configuration, roomId, events: peer.events })
      await peer.close()
    }
  }, 30_000)
})
