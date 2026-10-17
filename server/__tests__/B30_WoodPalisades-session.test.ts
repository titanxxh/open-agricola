import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeScores } from '../../shared/domain/scoring'
import { getFenceCount, getPalisadeCount } from '../../shared/actions/effects/fencing'

import '../../shared/cards/B/B030_WoodPalisades'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit19Farm from './_helpers/audit/ae-negative-19-farm'

const CARD_ID = 'B030_WoodPalisades'

// Tile (0,0) corner edges:
// H-0-0 = top border (border), H-1-0 = bottom of tile (internal)
// V-0-0 = left border (border), V-0-1 = right of tile (internal)
const tile00Fences = ['H-1-0', 'V-0-1']     // internal edges
const tile00Palisades = ['H-0-0', 'V-0-0']  // border edges

const setup = (overrides: { withCard?: boolean; wood?: number } = {}) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  player.resources = { ...player.resources, wood: overrides.wood ?? 8 }
  if (overrides.withCard !== false) {
    player.minorPlayed.push(CARD_ID)
  }

  session.loadState(state)
  return session
}

const bonusVpFor = (session: GameSession) => {
  const state = session.getState().state
  const scores = session.withCtx(() => computeScores(state))
  const summary = scores.find((s) => s.playerId === state.players[0]!.id)!
  return summary.categories.find((c) => c.key === 'cardBonusVp')?.total ?? 0
}

describe('B30 Wood Palisades — session', () => {
  it('places 2 border palisades + 2 internal fences, costs 6 wood, scores +2 VP', () => {
    const session = setup({ wood: 6 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: tile00Fences,
      palisadeEdges: tile00Palisades,
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(0)
    expect(player.pastures).toHaveLength(1)
    expect(getFenceCount(player)).toBe(2)
    expect(getPalisadeCount(player)).toBe(2)
    expect(bonusVpFor(session)).toBe(2)
  })

  it('mixes 2 fence + 2 palisade, costs 6 wood, scores +2 VP', () => {
    const session = setup({ wood: 6 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: ['V-0-1', 'H-1-0'],
      palisadeEdges: ['V-0-0', 'H-0-0'],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(0)
    expect(player.pastures).toHaveLength(1)
    expect(getFenceCount(player)).toBe(2)
    expect(getPalisadeCount(player)).toBe(2)
    expect(bonusVpFor(session)).toBe(2)
  })

  it('rejects palisades when B30 not played', () => {
    const session = setup({ withCard: false, wood: 8 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: [],
      palisadeEdges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      extraWood: 0,
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('PALISADES_NOT_UNLOCKED')
  })

  it('rejects palisade on internal edge even when B30 is played', () => {
    const session = setup({ wood: 6 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'V-0-0'],
      palisadeEdges: ['H-1-0'], // internal
      extraWood: 0,
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('PALISADE_NOT_ON_BORDER')
  })
})

describe('ae-negative-19-farm', () => {
  const { PALISADES, sessions, save, ok, setup, turn, buy, score, REAL, PALI, ALL, fence } = audit19Farm
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B030 N1 actual one food purchase unlocks palisades without immediate wood cost or bonus',()=>{const s=setup(PALISADES),{pending,r}=buy(s,PALISADES);assert.equal(r.state.players[0]!.resources.food,19);assert.equal(r.state.players[0]!.resources.wood,20);assert.equal(score(r,PALISADES),0);assert.equal(r.state.players[0]!.fenceSegments.length,0);save('B030-N1',{pending,r})})
  it('B030 N2 two border palisades and two normal fences cost six wood and exactly two bonus points',()=>{const s=setup(PALISADES,state=>state.players[0]!.resources.wood=6,true),pending=turn(s,0,'fencing'),r=fence(s);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.fenceSegments.filter(e=>e.type==='fence').length,2);assert.equal(r.state.players[0]!.fenceSegments.filter(e=>e.type==='palisade').length,2);assert.equal(r.state.players[0]!.pastures.length,1);assert.equal(score(r,PALISADES),2);save('B030-N2',{pending,r})})
  it('B030 N3 five wood hand only or internal palisade refuses before four ordinary fences',()=>{for(const mode of['poor','hand','internal']){const s=setup(PALISADES,state=>state.players[0]!.resources.wood=mode==='poor'?5:8,mode!=='hand'),pending=turn(s,0,'fencing');assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{edges:mode==='internal'?['H-0-0','V-0-0','V-0-1']:REAL,palisadeEdges:mode==='internal'?['H-1-0']:PALI,extraWood:0}));const r=ok(s.commitSelectionChoice(0,{edges:ALL,palisadeEdges:[],extraWood:0}));assert.equal(r.state.players[0]!.resources.wood,mode==='poor'?1:4);assert.equal(score(r,PALISADES),0);assert.equal(r.state.players[0]!.fenceSegments.filter(e=>e.type==='fence').length,4);save(`B030-N3-${mode}`,{pending,r})}})
  it('B030 N4 wrong actor and whole fence undo restore wood finite fence pieces and score before retry',()=>{const s=setup(PALISADES,state=>state.players[0]!.resources.wood=6,true),pending=turn(s,0,'fencing');assertRejectedUnchanged(s,()=>s.commitSelectionChoice(1,{edges:REAL,palisadeEdges:PALI,extraWood:0}));const r=fence(s),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,6);assert.equal(undone.state.players[0]!.fenceSegments.length,0);assert.equal(score(undone,PALISADES),0);turn(s,0,'fencing');const retry=fence(s);assert.equal(score(retry,PALISADES),2);save('B030-N4',{pending,r,undone,retry})})
})
