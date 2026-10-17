import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E007_Pumpernickel'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit25Immediate from './_helpers/audit/ae-negative-25-immediate'

const CARD_ID = 'E007_Pumpernickel'

const setup = () => {
  const session = new GameSession(407)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((entry, index) => setWorkersAtHome(state, entry, index === 0 ? 2 : 0))
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.resources.grain = 1
  player.resources.food = 0
  session.loadState(state)
  return session
}

const buyPumpernickel = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 6; step += 1) {
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find(
      (entry) => entry.value === CARD_ID
        || entry.value.startsWith('action-improvement-')
        || entry.value.startsWith('flow-'),
    )
    expect(option).toBeDefined()
    response = session.resolveChoice(0, option!.value)
  }
  return response
}

describe('E007 Pumpernickel native session', () => {
  it('pays 1 grain, gains 4 food, and passes to the next player', () => {
    const session = setup()
    const scoreBefore = session.getState().scores[0]!.total

    const response = buyPumpernickel(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 4 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid',
      resources: { grain: 1 },
      paymentFor: 'minor-improvement',
    }))
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.kind
      : response.interaction.stateId).toBe('confirm-next-player')
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: CARD_ID, gain: { food: 4 } }),
    }))
    expect(response.scores[0]!.total).toBe(scoreBefore - 2)
  })
})

describe('ae-negative-25-immediate', () => {
  const { BREAD, sessions, save, ok, ready, finish, menu, buy, make } = audit25Immediate
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E007 N1 actual passing purchase pays one grain and gains exactly four food without changing opponent',()=>{const s=make(BREAD,2),a=buy(s,BREAD);assert.equal(a.r.state.players[0]!.resources.grain,1);assert.equal(a.r.state.players[0]!.resources.food,104);assert.equal(a.r.state.players[1]!.resources.food,100);save('E007-N1',a)})
  it('E007 N2 zero grain rejects before a free alternative and unrelated action with card in hand gives no food',()=>{const s=make(BREAD,0),pending=menu(s),error=assertRejectedUnchanged(s,()=>s.resolveChoice(0,BREAD)),r=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.equal(r.state.players[0]!.resources.food,100);assert.ok(r.state.players[0]!.minorHand.includes(BREAD));save('E007-N2-reject',{pending,error,r});const ss=make(BREAD,1);ready(ss);const other=finish(ss,ok(ss.takeAction(0,'reed-bank')),false);assert.equal(other.state.players[0]!.resources.food,100);assert.equal(other.state.players[0]!.resources.grain,1);save('E007-N2-hand',other)})
  it('E007 N3 whole purchase undo restores grain food and original hand and replay grants exactly once',()=>{const s=make(BREAD,1),a=buy(s,BREAD),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.grain,1);assert.equal(undone.state.players[0]!.resources.food,100);assert.ok(undone.state.players[0]!.minorHand.includes(BREAD));const retry=buy(s,BREAD);assert.equal(retry.r.state.players[0]!.resources.grain,0);assert.equal(retry.r.state.players[0]!.resources.food,104);save('E007-N3',{a,undone,retry})})
})
