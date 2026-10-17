import { describe, expect, it, afterEach } from 'vitest'

import '../../shared/cards/D/D009_GameTrade'

import { GameSession } from '../game/authoritative-session'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit26Animals from './_helpers/audit/ae-negative-26-animals'

const CARD_ID = 'D009_GameTrade'

const buyMinor = (
  session: GameSession,
  response: ReturnType<GameSession['takeAction']>,
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  let cardPrompt = response
  const directOption = cardPrompt.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (!directOption) {
    const improvementOption = cardPrompt.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'),
    )
    expect(improvementOption).toBeDefined()
    cardPrompt = session.resolveChoice(0, improvementOption!.value)
    expect(cardPrompt.ok).toBe(true)
    if (cardPrompt.interaction.stateId !== 'wait') return cardPrompt
  }
  if (
    cardPrompt.interaction.sourceCard === CARD_ID ||
    cardPrompt.state.players[1]!.minorHand.includes(CARD_ID)
  ) return cardPrompt
  const cardOption = cardPrompt.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(cardOption).toBeDefined()
  return session.resolveChoice(0, cardOption!.value)
}

describe('D009_GameTrade session', () => {
  it('pays 2 sheep, gains 1 boar and 1 cattle, reorganizes them, then passes', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const buyer = state.players[0]!
    buyer.minorHand = [CARD_ID]
    buyer.resources.sheep = 2
    buyer.pastures = [
      {
        id: 'boar-pasture',
        size: 1,
        tiles: [{ row: 0, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
      {
        id: 'cattle-pasture',
        size: 1,
        tiles: [{ row: 0, col: 2 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]
    session.loadState(state)
    const scoreBefore = session.getState().scores[0]!.total

    let response = buyMinor(session, session.takeAction(0, 'meeting-place'))

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 1, cattle: 1 })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected animal reorganization')
    expect(response.interaction.request.kind).toBe('animal-reorg')

    response = session.resolveChoice(0, 'confirm', {
      zones: [
        { id: 'boar-pasture', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
        { id: 'cattle-pasture', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 },
      ],
    })

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'boar-pasture', animalType: 'boar', animalCount: 1 }),
      expect.objectContaining({ id: 'cattle-pasture', animalType: 'cattle', animalCount: 1 }),
    ]))
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.kind
      : response.interaction.stateId).toBe('confirm-next-player')
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: CARD_ID, gain: { boar: 1, cattle: 1 } }),
    }))
    expect(response.scores[0]!.total).toBe(scoreBefore + 2)
  })
})

describe('ae-negative-26-animals', () => {
  const { TRADE, sessions, save, ok, finish, menu, makeTrade, buyTrade, housing } = audit26Animals
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D009 N1 actual passing purchase pays two farmyard sheep for one pig and one cattle in separate legal pastures',()=>{const s=makeTrade(),a=buyTrade(s),r=housing(s,a.chosen);assert.deepEqual(['sheep','boar','cattle'].map(k=>r.state.players[0]!.resources[k as 'sheep']),[0,1,1]);assert.equal(r.state.players[0]!.resources.food,100);assert.ok(r.state.players[1]!.minorHand.includes(TRADE));assert.equal(r.state.players[1]!.resources.boar,0);save('D009-N1',{a,r})})
  it('D009 N2 one or zero farmyard sheep refuses before a real free alternative and retains card',()=>{for(const sheep of[0,1]){const s=makeTrade(sheep),pending=menu(s),error=assertRejectedUnchanged(s,()=>s.resolveChoice(0,TRADE)),r=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')),false);assert.equal(r.state.players[0]!.resources.sheep,sheep);assert.equal(r.state.players[0]!.resources.boar,0);assert.ok(r.state.players[0]!.minorHand.includes(TRADE));save(`D009-N2-${sheep}`,{pending,error,r})}})
  it('D009 N3 invalid mixed pasture and wrong actor reorganization reject before two legal animal zones',()=>{const s=makeTrade(),a=buyTrade(s);assert.ok(a.chosen.interaction.stateId==='wait'&&a.chosen.interaction.request.kind==='animal-reorg');const z=a.chosen.interaction.request.zones.find(z=>z.zoneType==='pasture');assert.ok(z);const mixed=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'confirm',{zones:[{...z,animalType:null,animalCount:2,animalCounts:{boar:1,cattle:1}}]})),wrong=assertRejectedUnchanged(s,()=>s.resolveChoice(1,'confirm',{zones:[]})),r=housing(s,a.chosen);assert.equal(r.state.players[0]!.resources.boar,1);assert.equal(r.state.players[0]!.resources.cattle,1);save('D009-N3',{a,mixed,wrong,r})})
  it('D009 N4 whole paid animal purchase undo restores two sheep and original passing hand before one replay',()=>{const s=makeTrade(),before=ok(s.getState()),a=buyTrade(s),r=housing(s,a.chosen),undone=ok(s.undoAction());assert.deepEqual(undone.state.players[0]!.pastures,before.state.players[0]!.pastures);assert.deepEqual(['sheep','boar','cattle'].map(k=>undone.state.players[0]!.resources[k as 'sheep']),[2,0,0]);assert.ok(undone.state.players[0]!.minorHand.includes(TRADE));const second=buyTrade(s),retry=housing(s,second.chosen);assert.equal(retry.state.players[0]!.resources.sheep,0);save('D009-N4',{before,a,r,undone,second,retry})})
})
