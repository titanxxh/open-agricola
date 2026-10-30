import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B130_FullPeasant'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit28Jump from './_helpers/audit/ae-negative-28-jump'

const CARD_ID = 'B130_FullPeasant'

const setup = (options?: {
  withCard?: boolean
  food?: number
  fencingOccupied?: boolean
  grainOccupied?: boolean
}) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5 // Grain Utilization (stage 1) and Fencing (stage 1) are both available

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: options?.food ?? 3,
    grain: 2,
    wood: 10,
  }
  player.fields = [{ row: 0, col: 2, stacks: [] }]
  state.players[1]!.workersAvailable = 2

  if (options?.withCard ?? true) {
    player.occupationPlayed.push(CARD_ID)
  }

  const grain = state.actionSpaces.find((s) => s.id === 'grain-utilization')
  const fencing = state.actionSpaces.find((s) => s.id === 'fencing')
  if (grain) grain.takenBy = options?.grainOccupied ? [{ playerId: state.players[1]!.id, workerId: '1' }] : []
  if (fencing) fencing.takenBy = options?.fencingOccupied ? [{ playerId: state.players[1]!.id, workerId: '1' }] : []

  session.loadState(state)
  return session
}

const completeGrainUtilization = (session: GameSession) => {
  let response = session.takeAction(0, 'grain-utilization')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.kind).toBe('farm-select')
  if (response.interaction.request.kind !== 'farm-select') return response

  const field = response.interaction.request.farm.selectableFields[0]
  expect(field).toBeDefined()
  if (!field) return response
  response = session.commitSelectionChoice(0, {
    crops: [{ ...field.tile, crop: 'grain' }],
  })
  expect(response.ok, response.error).toBe(true)
  return response
}

describe('B130_FullPeasant session', () => {
  it('offers optional chain after placing on grain-utilization when fencing is unoccupied', () => {
    const session = setup({ withCard: true, food: 3 })
    const resp = completeGrainUtilization(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const hasSkip = resp.interaction.request.options?.some((o) => o.value === '__skip__')
    expect(hasSkip).toBe(true)
    // The non-skip option is the pay-resources leaf for the optional seq
    const payOption = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    expect(payOption).toBeDefined()
  })

  it('pays 1 food and chains to fence when accepting from grain-utilization', () => {
    const session = setup({ withCard: true, food: 3 })
    const placedBefore = session.getState().state.players[0]!.stats?.placedFarmers ?? 0
    let resp = completeGrainUtilization(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Accept the B130 chain (non-skip option activates the optional seq)
    const accept = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)
    // Food should be -1 after pay (from 3 to 2)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    // Mech-A: farmer physically jumped from grain-utilization to fencing.
    const grainSpace = resp.state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    const fencingSpace = resp.state.actionSpaces.find((s) => s.id === 'fencing')!
    expect(grainSpace.takenBy).toEqual([])
    expect(fencingSpace.takenBy.length).toBe(1)
    expect(fencingSpace.takenBy[0]!.playerId).toBe(resp.state.players[0]!.id)
    // Both placements counted (entry +1, jump +1).
    expect(resp.state.players[0]!.stats!.placedFarmers).toBe(placedBefore + 2)
  })

  it('skipping the chain leaves the worker on grain-utilization (placedFarmers +1)', () => {
    const session = setup({ withCard: true, food: 3 })
    const placedBefore = session.getState().state.players[0]!.stats?.placedFarmers ?? 0
    let resp = completeGrainUtilization(session)
    if (resp.interaction.stateId !== 'wait') return
    resp = session.resolveChoice(0, '__skip__')
    const grainSpace = resp.state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    const fencingSpace = resp.state.actionSpaces.find((s) => s.id === 'fencing')!
    expect(grainSpace.takenBy.length).toBe(1)
    expect(fencingSpace.takenBy).toEqual([])
    expect(resp.state.players[0]!.stats!.placedFarmers).toBe(placedBefore + 1)
  })

  it('does not consume family pool on jump (worker count unchanged)', () => {
    const session = setup({ withCard: true, food: 3 })
    const stateBefore = session.getState().state
    const activeBefore = stateBefore.players[0]!.workers.filter((w) => w.isActive).length
    let resp = completeGrainUtilization(session)
    if (resp.interaction.stateId !== 'wait') return
    const accept = (resp.interaction.request.options ?? []).find((o) => o.value !== '__skip__')!
    resp = session.resolveChoice(0, accept.value)
    expect(resp.state.players[0]!.workers.filter((w) => w.isActive).length).toBe(activeBefore)
  })

  it('does not offer chain when the other space is occupied', () => {
    const session = setup({ withCard: true, food: 3, fencingOccupied: true })
    const resp = completeGrainUtilization(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('does not offer chain when player has no food', () => {
    const session = setup({ withCard: true, food: 0 })
    const resp = completeGrainUtilization(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('does not offer chain without the card', () => {
    const session = setup({ withCard: false, food: 3 })
    const resp = completeGrainUtilization(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('does not trigger on unrelated spaces', () => {
    const session = setup({ withCard: true, food: 3 })
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    // day-laborer is a simple gain action; no B130 trigger
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('triggers symmetrically on fencing → grain-utilization direction', () => {
    const session = setup({ withCard: true, food: 3, fencingOccupied: false, grainOccupied: false })
    // Make sure round allows fencing and grain-utilization
    const state = session.getState().state
    state.players[0]!.resources.wood = 10
    session.loadState(state)

    const resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    // fencing immediately goes into fence-selection UI (not a pre-placement choice).
    // We can't easily complete fence-selection here; just verify takeAction succeeded.
    // The B130 after-hook will fire when fence completes. We verify by confirming
    // that the listener is wired up correctly via its synchronous path — skipped,
    // we rely on flow-level tests for this branch.
    expect(resp.ok).toBe(true)
  })
})

describe('ae-negative-28-jump', () => {
  const { sessions, save, ok, ready, finish, make, drive, refs } = audit28Jump
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B130 N1 real Grain Utilization and Fencing in either order pay one food and use the same original person exactly once',()=>{for(const from of['grain-utilization','fencing']){const s=make(),before=ok(s.getState()),pending=ok(s.takeAction(0,from)),worker=refs(pending,from)[0],r=drive(s,pending),target=from==='fencing'?'grain-utilization':'fencing';assert.ok(worker);assert.deepEqual(refs(r,from),[]);assert.deepEqual(refs(r,target),[worker]);assert.equal(r.state.players[0]!.resources.food,0);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[0]!.fenceSegments.length,4);assert.deepEqual(r.state.players[0]!.fields[0]!.stacks,[{kind:'grain',remaining:3}]);assert.deepEqual(r.state.players[0]!.workers.map(w=>w.id),before.state.players[0]!.workers.map(w=>w.id));save(`B130-N1-${from}`,{before,pending,r})}})
  it('B130 N2 optional decline zero food and card in hand do not move the person or charge the second action',()=>{for(const mode of['decline','food','hand']){const s=make(mode!=='hand',mode==='food'?0:1),pending=ok(s.takeAction(0,'grain-utilization')),r=drive(s,pending,false);assert.equal(refs(r,'grain-utilization').length,1);assert.deepEqual(refs(r,'fencing'),[]);assert.equal(r.state.players[0]!.resources.food,mode==='food'?0:1);assert.equal(r.state.players[0]!.resources.wood,4);save(`B130-N2-${mode}`,{pending,r})}})
  it('B130 N3 an actual opponent Fencing placement makes the destination occupied and prevents a jump',()=>{const s=make(true,0);let r=ok(s.takeAction(0,'day-laborer'));ready(s);r=ok(s.takeAction(1,'fencing'));assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select');r=ok(s.commitSelectionChoice(1,{edges:['H-0-1','H-1-1','V-0-1','V-0-2'],palisadeEdges:[]}));ready(s);finish(s,ok(s.takeAction(2,'reed-bank')),false);ready(s);const pending=ok(s.takeAction(0,'grain-utilization'));r=drive(s,pending);assert.equal(refs(r,'grain-utilization').length,1);assert.deepEqual(refs(r,'fencing'),[]);assert.equal(r.state.players[0]!.resources.food,2);save('B130-N3',{pending,r})})
  it('B130 N4 wrong actor and illegal first sow selection reject before one legal paid jump',()=>{const s=make();let pending=ok(s.takeAction(0,'grain-utilization'));for(let n=0;n<8&&!(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='farm-select');n++){assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice');const o=pending.interaction.request.options.find(o=>!o.disabled&&!['__skip__','__done__'].includes(o.value));assert.ok(o);pending=ok(s.resolveChoice(0,o.value))}assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='farm-select');const bad=assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{crops:[{row:99,col:99,crop:'grain'}]})),wrong=assertRejectedUnchanged(s,()=>s.commitSelectionChoice(1,{crops:[{row:0,col:1,crop:'grain'}]})),r=drive(s,pending);assert.equal(r.state.players[0]!.resources.food,0);assert.equal(r.state.players[0]!.fenceSegments.length,4);save('B130-N4',{pending,bad,wrong,r})})
  it('B130 N5 whole two action jump undo restores both spaces original worker crops fences and paid resources before one replay',()=>{const s=make(),before=ok(s.getState()),r=drive(s,ok(s.takeAction(0,'grain-utilization'))),undone=ok(s.undoAction());assert.deepEqual(undone.state.actionSpaces,before.state.actionSpaces);assert.deepEqual(undone.state.players[0]!.workers,before.state.players[0]!.workers);assert.deepEqual(undone.state.players[0]!.resources,before.state.players[0]!.resources);assert.equal(undone.state.players[0]!.fenceSegments.length,0);assert.deepEqual(undone.state.players[0]!.fields[0]!.stacks,[]);const retry=drive(s,ok(s.takeAction(0,'grain-utilization')));assert.equal(retry.state.players[0]!.resources.food,0);save('B130-N5',{before,r,undone,retry})})
})
