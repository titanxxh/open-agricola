import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientCommand, ServerEvent } from '../../../shared/contract/protocol/ws'
import type { StateUpdateEnvelope } from '../../../shared/contract/protocol/game'
import { CommandStore } from '../../game/command-store'
import { createScenarioEvidence } from '../../__tests__/_helpers/scenario-evidence'
import { createSoloRecoveryHost } from '../../__tests__/_helpers/solo-recovery-network'
import { createWorkSession } from '../../__tests__/_helpers/session-fixtures'

const evidence = createScenarioEvidence(import.meta.url)
const source = { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), node: process.version }
type Host = Awaited<ReturnType<typeof createSoloRecoveryHost>>
const hosts: Host[] = []
afterEach(async () => {
  try { for (const host of hosts.splice(0)) await host.close() } finally { vi.restoreAllMocks(); vi.unstubAllEnvs() }
})

const openHost = async (seed = 24) => {
  const host = await createSoloRecoveryHost(seed)
  hosts.push(host)
  evidence.record('fixture-source', { ...source, ...host.source, seed })
  return host
}

const keep = (state: StateUpdateEnvelope) => {
  const interaction = state.payload.interaction
  if (interaction.stateId !== 'wait' || interaction.request.kind !== 'solo-hand-selection') throw new Error('Expected authoritative opening hand groups')
  return { groups: interaction.request.groups.map(group => {
    const cardIds = group.cardIds.filter(id => id !== 'E096_Elder').slice(0, group.keepCount)
    expect(cardIds).toHaveLength(group.keepCount)
    return { kind: group.kind, cardIds }
  }) }
}

const checkRebuild = (label: string, rebuilt: Awaited<ReturnType<Host['rebuild']>>) => {
  expect(rebuilt.before?.serialized).not.toBeNull()
  expect(rebuilt.after?.serialized).toEqual(rebuilt.before?.serialized)
  expect(rebuilt.after?.version).toBe(rebuilt.before?.version)
  expect(rebuilt.headAfter).toEqual(rebuilt.headBefore)
  expect(rebuilt.state.version).toBe(rebuilt.before?.version)
  evidence.record(label, { head: rebuilt.headAfter, version: rebuilt.state.version,
    interaction: rebuilt.state.payload.interaction, publicMoor: rebuilt.state.payload.state.farmersOfTheMoor,
    privateMoor: rebuilt.after?.serialized?.state.farmersOfTheMoor,
    cursor: rebuilt.after?.serialized?.sessionCursor.engineStackCursor,
  })
}

const T = 'moor-special-1-2-terrain'
type Peer = Awaited<ReturnType<Host['connect']>>
const issue = async (peer: Peer, state: StateUpdateEnvelope, command: ClientCommand) => {
  const result = await peer.mutate(command, state)
  evidence.record('network-command', { command, identity: result.identity, receipt: result.receipt,
    interaction: result.state.payload.interaction, moor: result.state.payload.state.farmersOfTheMoor,
    resources: result.state.payload.state.players[0]!.resources })
  return result.state
}
const confirm = async (peer: Peer, state: StateUpdateEnvelope) => {
  expect(state.payload.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  return issue(peer, state, { type: 'choice', value: 'confirm' })
}
const reject = async (host: Host, peer: Peer, state: StateUpdateEnvelope, command: ClientCommand) => {
  const before = await host.runtime().persistence.load(state.roomId)
  const head = await host.runtime().persistence.loadReplayHead(state.roomId)
  const prepared = await peer.prepare(command, state)
  peer.socket.send(JSON.stringify(prepared.command))
  const event = await peer.wait((event): event is Extract<ServerEvent, { type: 'commandReceipt' }> =>
    event.type === 'commandReceipt' && event.requestId === prepared.requestId)
  expect(event).toMatchObject({ status: 'completed', receipt: { outcome: { ok: false } } })
  expect((await host.runtime().persistence.load(state.roomId))?.serialized).toEqual(before?.serialized)
  expect(await host.runtime().persistence.loadReplayHead(state.roomId)).toEqual(head)
  evidence.record('rejected-unchanged', { command, event, head })
}
const publicSupply = (state: StateUpdateEnvelope) => {
  const moor = state.payload.state.farmersOfTheMoor!
  expect(moor.specialActionCards.every(card => card.location.kind !== 'solo-draw')).toBe(true)
  expect(JSON.stringify(moor.specialActionCards)).not.toContain('solo-draw')
  return moor
}
const finishRound = async (peer: Peer, initial: StateUpdateEnvelope) => {
  let state = initial
  for (const spaceId of ['day-laborer', 'fishing']) {
    expect(state.payload.interaction.stateId).toBe('idle')
    state = await issue(peer, state, { type: 'action', spaceId })
    state = await confirm(peer, state)
  }
  return state
}

describe('formal solo recovery over real sockets and durable storage', () => {
  it('keeps candidates across service rebuild and recovers a lost hand receipt without resubmitting the hand', async () => {
    const host = await openHost()
    const created = await host.create(true)
    const roomId = created.state.roomId
    expect(created.state.payload.state.phase).toBe('solo-hand-selection')
    expect(created.state.payload.state.parentSelection).toBeNull()
    const candidateWindow = await host.rebuild(roomId)
    checkRebuild('unsubmitted-candidates', candidateWindow)
    expect(candidateWindow.state.inputWindow).toEqual(created.state.inputWindow)
    expect(candidateWindow.state.payload.state.soloHandSelection).toEqual(created.state.payload.state.soloHandSelection)

    const selection = keep(candidateWindow.state)
    const prepared = await candidateWindow.peer.prepare({ type: 'soloHandSubmit', playerIndex: 0, selection }, candidateWindow.state)
    const broadcaster = host.runtime().backend.broadcaster
    const sendTo = broadcaster.sendTo.bind(broadcaster)
    vi.spyOn(broadcaster, 'sendTo').mockImplementation((socket, event) => {
      if (event.type === 'commandReceipt' && event.requestId === prepared.requestId) return
      sendTo(socket, event)
    })
    candidateWindow.peer.socket.send(JSON.stringify(prepared.command))
    const submitted = await candidateWindow.peer.wait((event): event is StateUpdateEnvelope =>
      event.type === 'stateUpdate' && event.roomId === roomId && event.version === 1)
    expect(submitted.payload.state.phase).toBe('parent-selection')
    expect(submitted.inputWindow?.kind).toBe('parent')
    expect(candidateWindow.peer.events.some(event => event.type === 'commandReceipt' && event.requestId === prepared.requestId)).toBe(false)
    const accepted = await new CommandStore(host.db).lookup(`user:${host.user.id}`, prepared.identity)
    expect(accepted.kind).toBe('completed')
    if (accepted.kind !== 'completed') throw new Error('Hand command was not committed')

    const recovered = await host.rebuild(roomId)
    checkRebuild('submitted-hand-parent-window', recovered)
    expect(recovered.state.payload.state.soloHandSelection?.kept).toEqual(selection)
    expect(recovered.state.payload.state.parentSelection).toEqual(submitted.payload.state.parentSelection)
    const queryId = randomUUID()
    recovered.peer.socket.send(JSON.stringify({ type: 'getCommandReceipt', identity: prepared.identity, requestId: queryId }))
    const receipt = await recovered.peer.wait((event): event is Extract<ServerEvent, { type: 'commandReceipt' }> =>
      event.type === 'commandReceipt' && event.requestId === queryId)
    expect(receipt).toMatchObject({ status: 'completed', receipt: accepted.receipt })
    const retryId = randomUUID()
    recovered.peer.socket.send(JSON.stringify({ ...prepared.command, requestId: retryId }))
    const duplicate = await recovered.peer.wait((event): event is Extract<ServerEvent, { type: 'commandReceipt' }> =>
      event.type === 'commandReceipt' && event.requestId === retryId)
    expect(duplicate).toMatchObject({ status: 'completed', receipt: accepted.receipt })
    expect(await host.runtime().persistence.loadReplayHead(roomId)).toEqual(recovered.headAfter)
    expect((await host.runtime().persistence.load(roomId))?.serialized).toEqual(recovered.after?.serialized)
    expect(await host.db.prepare('SELECT count(*) AS count FROM game_replay_steps WHERE room_id=?').get(roomId)).toEqual({ count: 2 })
  }, 30_000)

  it('recovers retention, retries its frozen durable payment once, then keeps and reveals the same ordered supply', async () => {
    const host = await openHost()
    const created = await host.create()
    const roomId = created.state.roomId
    let peer = created.peer
    let state = await issue(peer, created.state, { type: 'soloHandSubmit', playerIndex: 0, selection: keep(created.state) })
    expect(publicSupply(state).specialActionCards).toMatchObject([{ id: T, location: { kind: 'solo-current' } }])
    state = await issue(peer, state, { type: 'action', spaceId: 'day-laborer' })
    state = await confirm(peer, state)
    const tile = state.payload.state.players[0]!.farmTerrain!.find(tile => tile.kind === 'moor')!
    state = await issue(peer, state, { type: 'specialAction', cardId: T, actionId: 'cut-peat', payload: { tile } })
    expect(state.payload.interaction).toMatchObject({ request: { moorSolo: { window: 'retention' } } })
    const waiting = await host.rebuild(roomId)
    checkRebuild('retention-before-payment', waiting)
    ;({ peer, state } = waiting)
    expect(publicSupply(state).specialActionCards[0]!.location).toEqual({ kind: 'solo-current', inUse: true })
    expect(state.payload.state.players[0]!.resources).toMatchObject({ food: 2, fuel: 3 })
    await reject(host, peer, state, { type: 'specialAction', cardId: T, actionId: 'cut-peat', payload: { tile } })

    const frozen = await host.runtime().persistence.load(roomId)
    const frozenHead = await host.runtime().persistence.loadReplayHead(roomId)
    const commit = host.runtime().persistence.commitReplay.bind(host.runtime().persistence)
    let unavailable = true
    vi.spyOn(host.runtime().persistence, 'commitReplay').mockImplementation(input => unavailable
      ? Promise.reject(new Error('retention acceptance storage outage')) : commit(input))
    const payment = await peer.prepare({ type: 'choice', value: 'retain' }, state)
    peer.socket.send(JSON.stringify(payment.command))
    await peer.wait((event): event is Extract<ServerEvent, { type: 'roomPersistencePaused' }> =>
      event.type === 'roomPersistencePaused' && event.roomId === roomId)
    expect(host.runtime().backend.committer!.isRetrying(roomId)).toBe(true)
    expect((await host.runtime().persistence.load(roomId))?.serialized).toEqual(frozen?.serialized)
    expect(await host.runtime().persistence.loadReplayHead(roomId)).toEqual(frozenHead)
    expect(peer.events.some(event => event.type === 'commandReceipt' && event.requestId === payment.requestId)).toBe(false)
    expect(peer.events.some(event => event.type === 'stateUpdate' && event.version > state.version)).toBe(false)
    expect((await new CommandStore(host.db).lookup(`user:${host.user.id}`, payment.identity)).kind).not.toBe('completed')
    evidence.record('retention-save-failed-unpublished', { head: frozenHead, food: frozen?.serialized?.state.players[0]!.resources.food })
    unavailable = false
    const receipt = await peer.wait((event): event is Extract<ServerEvent, { type: 'commandReceipt' }> =>
      event.type === 'commandReceipt' && event.requestId === payment.requestId)
    expect(receipt).toMatchObject({ status: 'completed', receipt: { outcome: { ok: true, roomVersion: state.version + 1 } } })
    state = await peer.wait((event): event is StateUpdateEnvelope => event.type === 'stateUpdate' && event.version === state.version + 1)
    expect(state.payload.state.players[0]!.resources).toMatchObject({ food: 0, fuel: 3 })
    expect(publicSupply(state).soloSupply?.retentionPaid).toBe(true)
    const paid = await host.rebuild(roomId)
    checkRebuild('retention-paid-before-continue', paid)
    ;({ peer, state } = paid)
    expect(paid.after?.serialized?.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')).toHaveLength(1)
    const retryId = randomUUID()
    peer.socket.send(JSON.stringify({ ...payment.command, requestId: retryId }))
    expect(await peer.wait((event): event is Extract<ServerEvent, { type: 'commandReceipt' }> =>
      event.type === 'commandReceipt' && event.requestId === retryId)).toEqual({ ...receipt, requestId: retryId })
    expect(await host.runtime().persistence.loadReplayHead(roomId)).toEqual(paid.headAfter)
    state = await confirm(peer, state)
    state = await issue(peer, state, { type: 'action', spaceId: 'fishing' })
    state = await confirm(peer, state)
    expect(state.payload.state.round).toBe(2)
    expect(state.payload.interaction).toMatchObject({ request: { moorSolo: { window: 'preparation', currentCardId: T } } })
    const preparation = await host.rebuild(roomId)
    checkRebuild('preparation-before-keep', preparation)
    ;({ peer, state } = preparation)
    const ordered = preparation.after!.serialized!.state.farmersOfTheMoor!.specialActionCards
    state = await issue(peer, state, { type: 'choice', value: 'keep' })
    expect(state.payload.interaction.stateId).toBe('idle')
    expect(publicSupply(state).soloSupply).toMatchObject({ drawCount: 9, retentionPaid: false })
    expect((await host.runtime().persistence.load(roomId))!.serialized!.state.farmersOfTheMoor!.specialActionCards).toEqual(ordered)
    state = await finishRound(peer, state)
    expect(state.payload.state.round).toBe(3)
    const next = ordered.filter(card => card.location.kind === 'solo-draw').sort((a, b) =>
      (a.location.kind === 'solo-draw' ? a.location.order : 0) - (b.location.kind === 'solo-draw' ? b.location.order : 0))[0]!
    expect(publicSupply(state).soloSupply?.nextCardActions).toEqual(next.actions)
    state = await issue(peer, state, { type: 'choice', value: 'replace' })
    expect(publicSupply(state).specialActionCards.find(card => card.location.kind === 'solo-current')?.id).toBe(next.id)
    const revealed = await host.rebuild(roomId)
    checkRebuild('preparation-after-hidden-reveal', revealed)
    ;({ peer, state } = revealed)
    const hidden = revealed.after!.serialized!.state.farmersOfTheMoor!.specialActionCards.filter(card => card.location.kind === 'solo-draw')
    // Previously revealed faces may remain in the log; the live supply and availability hide pile membership.
    const liveProjection = JSON.stringify({ moor: publicSupply(state), availability: state.payload.actionAvailability })
    for (const card of hidden) expect(liveProjection).not.toContain(card.id)
    await reject(host, peer, state, { type: 'undoStep' })
    await reject(host, peer, state, { type: 'undoAction' })
  }, 60_000)

  it('restores the real Horse Market animal decision before its retention barrier', async () => {
    const host = await openHost(3)
    const created = await host.create()
    const roomId = created.state.roomId
    let peer = created.peer
    let state = await issue(peer, created.state, { type: 'soloHandSubmit', playerIndex: 0, selection: keep(created.state) })
    state = await issue(peer, state, { type: 'action', spaceId: 'day-laborer' })
    state = await confirm(peer, state)
    const card = publicSupply(state).specialActionCards.find(card => card.location.kind === 'solo-current')!
    expect(card.id).toBe('moor-special-1-4-wood-horse')
    state = await issue(peer, state, { type: 'specialAction', cardId: card.id, actionId: 'horse-market' })
    expect(state.payload.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    const body = await host.rebuild(roomId)
    checkRebuild('actual-horse-market-body-wait', body)
    ;({ peer, state } = body)
    const interaction = state.payload.interaction
    if (interaction.stateId !== 'wait' || interaction.request.kind !== 'animal-reorg') throw new Error('Lost native animal handling')
    expect(publicSupply(state).soloSupply?.retentionPaid).toBe(false)
    expect(publicSupply(state).specialActionCards[0]!.location).toEqual({ kind: 'solo-current', inUse: true })
    const zone = interaction.request.zones.find(zone => zone.zoneType === 'house')!
    await reject(host, peer, state, { type: 'choice', value: 'retain' })
    await reject(host, peer, state, { type: 'choice', value: 'confirm', payload: { zones: [{ ...zone, animalCount: 100 }] } })
    state = await issue(peer, state, { type: 'choice', value: 'confirm', payload: { zones: [{ ...zone, animalType: 'horse', animalCount: 1 }] } })
    expect(state.payload.state.players[0]!.resources).toMatchObject({ food: 2, horse: 1 })
    expect(state.payload.interaction).toMatchObject({ request: { moorSolo: { window: 'retention' } } })
    state = await issue(peer, state, { type: 'choice', value: 'discard' })
    expect(publicSupply(state).specialActionCards.find(current => current.id === card.id)?.location.kind).toBe('solo-discard')
    expect(state.payload.state.players[0]!.resources.food).toBe(2)
    await confirm(peer, state)
  }, 30_000)

  it('restores exhaustion and later reuses only the latest discard from an explicitly directed work fixture', async () => {
    const host = await openHost()
    const created = await host.create()
    const roomId = created.state.roomId
    await issue(created.peer, created.state, { type: 'soloHandSubmit', playerIndex: 0, selection: keep(created.state) })
    // This is a declared low-probability starting checkpoint, not natural fourteen-round evidence.
    const fixture = createWorkSession({ seed: 24, options: { playerCount: 1, enableFarmersOfTheMoor: true }, configure: state => {
      state.round = 5
      let order = 0
      for (const card of state.farmersOfTheMoor!.specialActionCards) card.location = card.id === T
        ? { kind: 'solo-draw', order: 0 } : { kind: 'solo-discard', order: order++ }
    } })
    const room = host.runtime().backend.registry.get(roomId)!
    room.session.dispose()
    room.session = fixture
    expect(await host.runtime().backend.committer!.commit(room, fixture.getState(), {
      commandType: 'acceptance-directed-work-fixture', intentJson: JSON.stringify({ round: 5, drawCount: 1, discardCount: 9 }),
    }, 0)).toMatchObject({ kind: 'committed' })
    const initial = await host.rebuild(roomId)
    checkRebuild('directed-fixture-one-hidden-card', initial)
    let { peer, state } = initial
    expect(publicSupply(state).soloSupply?.drawCount).toBe(1)
    expect(publicSupply(state).specialActionCards.some(card => card.location.kind === 'solo-current')).toBe(false)
    state = await finishRound(peer, state)
    expect(state.payload.state.round).toBe(6)
    expect(publicSupply(state).specialActionCards.find(card => card.location.kind === 'solo-current')?.id).toBe(T)
    const last = await host.rebuild(roomId)
    checkRebuild('last-hidden-card-revealed', last)
    ;({ peer, state } = last)
    expect(publicSupply(state).soloSupply?.drawCount).toBe(0)
    const tile = state.payload.state.players[0]!.farmTerrain!.find(tile => tile.kind === 'moor')!
    state = await issue(peer, state, { type: 'specialAction', cardId: T, actionId: 'cut-peat', payload: { tile } })
    state = await issue(peer, state, { type: 'choice', value: 'discard' })
    state = await confirm(peer, state)
    expect(publicSupply(state).specialActionCards.some(card => card.location.kind === 'solo-current')).toBe(false)
    expect(publicSupply(state).specialActionCards).toHaveLength(10)
    await reject(host, peer, state, { type: 'specialAction', cardId: T, actionId: 'cut-peat', payload: { tile } })
    state = await finishRound(peer, state)
    expect(state.payload.state.round).toBe(7)
    const fallback = await host.rebuild(roomId)
    checkRebuild('exhausted-latest-discard-next-preparation', fallback)
    expect(publicSupply(fallback.state).soloSupply?.drawCount).toBe(0)
    expect(publicSupply(fallback.state).specialActionCards.find(card => card.location.kind === 'solo-current')?.id).toBe(T)
    expect(publicSupply(fallback.state).specialActionCards.filter(card => card.location.kind === 'solo-discard')).toHaveLength(9)
  }, 45_000)
})
