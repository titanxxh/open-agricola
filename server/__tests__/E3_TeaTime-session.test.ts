import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { workersAvailable } from '../../shared/domain/player'
import { E003_TeaTime } from '../../shared/cards/E/E003_TeaTime'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit23Placement from './_helpers/audit/ae-negative-23-placement'

const CARD_ID = 'E003_TeaTime'

describe('E003_TeaTime session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2

    const owner = state.players[0]!
    owner.minorHand.push(CARD_ID)
    owner.resources.food = 5
    session.loadState(state)
    return session
  }

  it('returns the owner worker home from grain-utilization on play', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!

    // Simulate owner has occupied grain-utilization: place one of owner's workers there
    const grainSpace = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    const ownerWorker = owner.workers.find((w) => w.isActive)!
    grainSpace.takenBy = [{ playerId: owner.id, workerId: ownerWorker.id }]
    const workersBefore = workersAvailable(state, owner)

    session.loadState(state)
    const resp = session.devPlayCard(0, CARD_ID)
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    const space = after.actionSpaces.find((s) => s.id === 'grain-utilization')!
    expect(space.takenBy).toEqual([])
    expect(workersAvailable(after, after.players[0]!)).toBe(workersBefore + 1)
    expect(after.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('is a no-op when owner has no worker on grain-utilization', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    // Make sure another player's worker is on the space
    const grainSpace = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
    const other = state.players[1]!
    const otherWorker = other.workers.find((w) => w.isActive)!
    grainSpace.takenBy = [{ playerId: other.id, workerId: otherWorker.id }]
    const workersBefore = workersAvailable(state, owner)

    session.loadState(state)
    const resp = session.devPlayCard(0, CARD_ID)
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    const space = after.actionSpaces.find((s) => s.id === 'grain-utilization')!
    // Opponent's worker should remain
    expect(space.takenBy.some((t) => t.playerId === state.players[1]!.id)).toBe(true)
    // No extra worker returned to owner
    expect(workersAvailable(after, after.players[0]!)).toBe(workersBefore)
  })

  describe('prerequisite "Own Person on Grain Utilization"', () => {
    it('blocks when no own worker is on Grain Utilization', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')
      if (space) space.takenBy = []
      expect(session.withCtx(() => meetsCardPrerequisites(player, E003_TeaTime, state.round, state))).toBe(false)
    })

    it('allows when own worker sits on Grain Utilization', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')!
      space.takenBy = [{ playerId: player.id, workerId: player.workers[0]!.id }]
      expect(session.withCtx(() => meetsCardPrerequisites(player, E003_TeaTime, state.round, state))).toBe(true)
    })
  })
})

describe('ae-negative-23-placement', () => {
  const { TEA, sessions, save, ok, setup, ready, finish, menu, buy, turn, grainUse, occupied } = audit23Placement
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E003 N1 actual Grain Utilization then paid passing purchase recalls that same person for a later real placement',()=>{const s=setup(TEA,8),util=grainUse(s,0),worker=occupied(util,'grain-utilization')[0]!.workerId;finish(s,turn(s,1,'clay-pit'));const {pending,r}=buy(s,TEA);assert.equal(r.state.players[0]!.resources.food,99);assert.equal(occupied(r,'grain-utilization').length,0);assert.equal(workersAvailable(r.state,r.state.players[0]!),1);assert.ok(r.state.players[1]!.minorHand.includes(TEA));finish(s,turn(s,1,'reed-bank'));const replay=finish(s,turn(s,0,'grain-seeds'),false);assert.equal(occupied(replay,'grain-seeds')[0]!.workerId,worker);assert.equal(replay.state.players[0]!.resources.grain,1);assert.equal(workersAvailable(replay.state,replay.state.players[0]!),0);save('E003-N1',{util,worker,pending,r,replay})})
  it('E003 N2 absent own occupancy opponent occupancy and no card food reject without recalling a person',()=>{for(const mode of['absent','opponent','food']){const s=setup(TEA,8,state=>{if(mode==='food')state.players[0]!.resources.food=0});if(mode==='opponent'){finish(s,turn(s,0,'forest'));grainUse(s,1)}else if(mode==='food'){grainUse(s,0);finish(s,turn(s,1,'clay-pit'))}const pending=menu(s),rejected=assertRejectedUnchanged(s,()=>s.resolveChoice(0,TEA)),r=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')),false);assert.ok(r.state.players[0]!.minorHand.includes(TEA));assert.equal(occupied(r,'grain-utilization').length,mode==='food'?1:0);save(`E003-N2-${mode}`,{pending,rejected,r})}})
  it('E003 N3 whole purchase undo restores exact Grain Utilization occupant and food before one recall replay',()=>{const s=setup(TEA,8),util=grainUse(s,0);finish(s,turn(s,1,'clay-pit'));const before=ready(s),a=buy(s,TEA),undone=ok(s.undoAction());assert.deepEqual(occupied(undone,'grain-utilization'),occupied(util,'grain-utilization'));assert.equal(undone.state.players[0]!.resources.food,100);assert.ok(undone.state.players[0]!.minorHand.includes(TEA));assert.deepEqual(undone.state.actionSpaces,before.state.actionSpaces);const r=buy(s,TEA).r;assert.equal(workersAvailable(r.state,r.state.players[0]!),1);assert.equal(r.state.players[0]!.resources.food,99);save('E003-N3',{util,before,a,undone,r})})
})
