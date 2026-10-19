import { enterFeeding } from './_helpers/harvest-feeding'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardEffect } from '../../shared/cards/card-effects'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import type { FeedSelection } from '../../shared/session/session-core'

import '../../shared/cards/E/E153_StoneSculptor'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit55Phase from './_helpers/audit/ae-negative-55-phase'

const CARD_ID = 'E153_StoneSculptor'

const setupHarvestRound = (round = 4) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = round
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = 0
  })
  state.players[0]!.startPlayer = true
  state.players[1]!.startPlayer = false
  state.players[0]!.name = 'P1'
  state.players[1]!.name = 'P2'
  return { session, state }
}

const drainHarvest = (session: GameSession, feedSelections: Record<number, FeedSelection[]> = {}) => {
  const submitted = new Set<number>()
  let resp = enterFeeding(session)
  while (resp.interaction.stateId === 'wait') {
    if (resp.interaction.request.kind === 'feed') {
      const idx = resp.interaction.playerIndex
      const selections = submitted.has(idx) ? [] : feedSelections[idx] ?? []
      submitted.add(idx)
      resp = session.resolveChoice(idx, 'confirm', { selections })
    } else if (resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.zones ?? [])
    } else {
      const opts = resp.interaction.request.options ?? []
      const next = opts.find((option) => option.value === '__skip__') ?? opts[0]
      if (!next) break
      resp = session.resolveChoice(resp.interaction.playerIndex, next.value)
    }
    if (!resp.ok) throw new Error(resp.error ?? 'failed to drain harvest')
  }
  return resp
}

describe('E153_StoneSculptor exchange metadata', () => {
  it('declares a harvest-window exchange with bonusVp sideEffect', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 1
    session.loadState(state)

    const trades = session.withCtx(() => getExchangesInWindow(player, 'harvest'))
    const own = trades.find((t) => t.sourceId === CARD_ID)
    expect(own).toBeDefined()
    expect(own!.from).toEqual({ stone: 1 })
    expect(own!.to).toEqual({ food: 1 })
    expect(own!.max).toBe(1)
    expect(own!.sideEffect).toEqual({ type: 'bonusVp', amount: 1 })
  })

  it('exposes nothing in the anytime window', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)
    const anytime = session.withCtx(() => getExchangesInWindow(player, 'anytime'))
    expect(anytime.find((t) => t.sourceId === CARD_ID)).toBeUndefined()
  })

  it('computeBonusScore reads cardStates.bonusVpEarned', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.cardStates = {
      [CARD_ID]: { extraData: { bonusVpEarned: 4 } },
    }
    session.loadState(state)
    const eff = session.withCtx(() => getCardEffect(CARD_ID))
    expect(eff?.computeBonusScore).toBeDefined()
    const score = session.withCtx(() => eff!.computeBonusScore!(state, player, {} as never))
    expect(score).toBe(4)
  })

  it('computeBonusScore returns 0 when no usage recorded', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)
    const eff = session.withCtx(() => getCardEffect(CARD_ID))!
    const score = session.withCtx(() => eff.computeBonusScore!(state, player, {} as never))
    expect(score).toBe(0)
  })
})

describe('E153_StoneSculptor harvest integration', () => {
  it('exchanging 1 stone during harvest feed: -1 stone, +1 food, +1 bonusVp', () => {
    const { session, state } = setupHarvestRound(4)
    const p1 = state.players[0]!
    p1.occupationPlayed.push(CARD_ID)
    p1.resources.stone = 1
    p1.resources.food = 0 // family of 1 needs 2 food → trigger harvestFeed prompt
    p1.familySize = 1
    state.players[1]!.resources.food = 5
    session.loadState(state)

    const resp = drainHarvest(session, {
      0: [
        {
          count: 1,
          sourceId: CARD_ID,
          exchangeIndex: 0,
          sourceName: 'Stone Sculptor',
        },
      ],
    })

    const finalP1 = resp.state.players[0]!
    expect(finalP1.resources.stone).toBe(0)
    expect(finalP1.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned).toBe(1)
  })

  it('rejects a count above max without mutating the feeding draft, then accepts count=1', () => {
    const { session, state } = setupHarvestRound(4)
    const p1 = state.players[0]!
    p1.occupationPlayed.push(CARD_ID)
    p1.resources.stone = 5
    p1.resources.food = 0
    p1.familySize = 1
    state.players[1]!.resources.food = 5
    session.loadState(state)

    let resp = enterFeeding(session)
    expect(resp.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: { kind: 'feed', maxTradeTimesBySourceId: { [CARD_ID]: 1 } },
    })
    const before = session.getState()

    resp = session.resolveChoice(0, 'confirm', { selections: [{
      count: 2,
      sourceId: CARD_ID,
      exchangeIndex: 0,
      sourceName: 'Stone Sculptor',
    }] })

    expect(resp.ok).toBe(false)
    expect(resp.state).toEqual(before.state)
    expect(resp.interaction).toEqual(before.interaction)

    resp = session.resolveChoice(0, 'confirm', { selections: [{
      count: 1,
      sourceId: CARD_ID,
      exchangeIndex: 0,
      sourceName: 'Stone Sculptor',
    }] })

    const finalP1 = resp.state.players[0]!
    expect(resp.ok).toBe(true)
    expect(finalP1.resources.stone).toBe(4)
    expect(finalP1.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned).toBe(1)
  })

  it('two harvests accumulate bonusVp', () => {
    // First harvest at round 4
    const { session, state } = setupHarvestRound(4)
    const p1 = state.players[0]!
    p1.occupationPlayed.push(CARD_ID)
    p1.resources.stone = 5
    p1.resources.food = 0
    p1.familySize = 1
    state.players[1]!.resources.food = 5
    session.loadState(state)

    let resp = drainHarvest(session, {
      0: [{ count: 1, sourceId: CARD_ID, exchangeIndex: 0 }],
    })
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned).toBe(1)

    // Now jump to round 7 (next harvest) by manipulating state and re-driving.
    const s2 = resp.state
    s2.round = 7
    s2.roundPhase = 'work'
    s2.players.forEach((p) => {
      markAllWorkersUsed(s2, p)
      setActiveWorkerCount(p, 1)
    })
    s2.players[0]!.resources.food = 0
    s2.players[0]!.familySize = 1
    s2.players[1]!.resources.food = 5
    session.loadState(s2)

    resp = drainHarvest(session, {
      0: [{ count: 1, sourceId: CARD_ID, exchangeIndex: 0 }],
    })
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned).toBe(2)
  })

  it('player without E153: harvest exchange not exposed', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    // Do NOT push E153 into occupationPlayed.
    session.loadState(state)
    const trades = session.withCtx(() => getExchangesInWindow(player, 'harvest'))
    expect(trades.find((t) => t.sourceId === CARD_ID)).toBeUndefined()
  })

  it('rejects count=1 with zero stone and accepts an empty retry', () => {
    const { session, state } = setupHarvestRound(4)
    const p1 = state.players[0]!
    p1.occupationPlayed.push(CARD_ID)
    p1.resources.stone = 0
    p1.resources.food = 4 // enough for family of 1 (2 food required)
    p1.familySize = 1
    state.players[1]!.resources.food = 5
    session.loadState(state)

    let resp = enterFeeding(session)
    expect(resp.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: { kind: 'feed' },
    })
    const before = session.getState()

    resp = session.resolveChoice(0, 'confirm', { selections: [
      { count: 1, sourceId: CARD_ID, exchangeIndex: 0 },
    ] })

    expect(resp.ok).toBe(false)
    expect(resp.state).toEqual(before.state)
    expect(resp.interaction).toEqual(before.interaction)

    resp = session.resolveChoice(0, 'confirm', { selections: [] })
    const finalP1 = resp.state.players[0]!
    expect(resp.ok).toBe(true)
    expect(finalP1.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned).toBeUndefined()
  })
})

describe('ae-negative-55-phase', () => {
  const { sessions, ok, save, make, finish, score, end, trade, feed } = audit55Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E153 N1 actual harvest exchanges one stone for one food and one scored point while duplicate use rejects before one legal retry',()=>{const s=make('E153_StoneSculptor',st=>{st.players[0]!.resources.stone=2},true,4),p=feed(s),rejected=assertRejectedUnchanged(s,()=>trade(s,2)),r=finish(s,ok(trade(s,1)));assert.equal(r.state.players[0]!.resources.stone,1);assert.equal(r.state.players[0]!.resources.food,97);assert.equal(score(r,'E153_StoneSculptor'),1);save('E153-N1',{p,rejected,r})})
  it('E153 N2 decline zero stone nonharvest and hand-only card cannot earn a Stone Sculptor point',()=>{for(const mode of['decline','stone','round','hand']){const s=make('E153_StoneSculptor',st=>{if(mode==='stone'||mode==='hand'){st.players[0]!.resources.food=3;st.players[0]!.resources.grain=1;}st.players[0]!.resources.stone=mode==='stone'?0:1},mode!=='hand',mode==='round'?5:4),initial=mode==='round'?end(s):feed(s);let rejected:SessionResponse|undefined;if(mode!=='round'){assert.ok(initial.interaction.stateId==='wait'&&initial.interaction.request.kind==='feed');const recipes=(initial.interaction.request.exchangeCatalog??[]).filter(recipe=>recipe.sourceId==='E153_StoneSculptor');if(mode==='hand')assert.deepEqual(recipes,[]);if(mode==='stone'){assert.ok((initial.interaction.request.exchangeCatalog??[]).some(recipe=>recipe.from.grain===1&&recipe.to.food===1));assert.equal(initial.state.players[0]!.resources.stone,0);assert.ok(recipes.length<=1);if(recipes.length){assert.equal(recipes[0]!.from.stone,1);assert.equal(Math.min(recipes[0]!.max??Infinity,initial.state.players[0]!.resources.stone),0);}rejected=assertRejectedUnchanged(s,()=>trade(s,1));}}const r=finish(s,initial,false,mode==='round'?'E153_StoneSculptor':undefined);assert.equal(score(r,'E153_StoneSculptor'),0);assert.equal(r.state.players[0]!.resources.grain,mode==='stone'||mode==='hand'?1:0);assert.equal(r.state.players[0]!.resources.stone,mode==='stone'?0:1);save(`E153-N2-${mode}`,{initial,rejected,r})}})
})
