import { describe, expect, it, afterEach } from 'vitest'

import '../../shared/cards/C/C004_WritingBoards'

import { GameSession } from '../game/authoritative-session'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit23Purchase from './_helpers/audit/ae-negative-23-purchase'

const CARD_ID = 'C004_WritingBoards'

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

const setup = (occupationCount: number) => {
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
  buyer.occupationPlayed = Array.from(
    { length: occupationCount },
    (_, index) => `__test_occupation_${index}__`,
  )
  buyer.resources.food = 1
  buyer.resources.wood = 0
  session.loadState(state)
  return session
}

describe('C004_WritingBoards session', () => {
  it.each([0, 2])(
    'pays 1 food, gains 1 wood per played occupation (%i), then passes',
    (occupationCount) => {
      const session = setup(occupationCount)
      const scoreBefore = session.getState().scores[0]!.total

      const response = buyMinor(session, session.takeAction(0, 'meeting-place'))

      expect(response.ok).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({
        food: 0,
        wood: occupationCount,
      })
      expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
      expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
      expect(response.interaction.stateId === 'wait'
        ? response.interaction.request.kind
        : response.interaction.stateId).toBe('confirm-next-player')
      expect(response.state.log).toContainEqual(expect.objectContaining({
        key: 'log.cardEffectPay',
        params: expect.objectContaining({ cardId: CARD_ID, cost: { food: 1 } }),
      }))
      expect(response.state.log.some((entry) =>
        entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID,
      )).toBe(occupationCount > 0)
      expect(response.scores[0]!.total).toBe(scoreBefore)
    },
  )
})

describe('ae-negative-23-purchase', () => {
  const { BOARDS, sessions, save, ok, ready, finish, menu, buy, prepare } = audit23Purchase
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C004 N1 actual paid passing purchase counts zero one or three own played occupations only',()=>{for(const count of[0,1,3]){const s=prepare(BOARDS,count),{pending,r}=buy(s,BOARDS);assert.equal(r.state.players[0]!.resources.food,99);assert.equal(r.state.players[0]!.resources.wood,count);assert.equal(r.state.players[1]!.resources.wood,0);assert.equal(r.state.players[0]!.occupationPlayed.length,count);assert.equal(r.state.players[0]!.minorPlayed.length,1);assert.ok(r.state.log.length>pending.state.log.length);save(`C004-N1-${count}`,{pending,r})}})
  it('C004 N2 no food rejects before a real free passing alternative without occupation wood',()=>{const s=prepare(BOARDS,3,0,'wood',0,0),pending=menu(s),rejected=assertRejectedUnchanged(s,()=>s.resolveChoice(0,BOARDS)),legal=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.equal(legal.state.players[0]!.resources.wood,0);assert.ok(legal.state.players[0]!.minorHand.includes(BOARDS));save('C004-N2',{pending,rejected,legal})})
  it('C004 N3 whole purchase undo restores food wood and passing hands then awards once on replay',()=>{const s=prepare(BOARDS,3),{pending,r}=buy(s,BOARDS),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,100);assert.equal(undone.state.players[0]!.resources.wood,0);assert.ok(undone.state.players[0]!.minorHand.includes(BOARDS));assert.ok(!undone.state.players[1]!.minorHand.includes(BOARDS));const retry=buy(s,BOARDS).r;assert.equal(retry.state.players[0]!.resources.wood,3);assert.equal(retry.state.players[0]!.resources.food,99);save('C004-N3',{pending,r,undone,retry})})
  it('C004 N4 real first Lessons occupation then later purchase includes that played occupation and excludes hand occupations',()=>{const s=prepare(BOARDS);const occupation=finish(s,ok(s.takeAction(0,'lessons')));assert.ok(occupation.state.players[0]!.occupationPlayed.includes('A110_Roughcaster'));ready(s);finish(s,ok(s.takeAction(1,'grain-seeds')));const{pending,r}=buy(s,BOARDS);assert.equal(r.state.players[0]!.resources.wood,1);save('C004-N4',{occupation,pending,r})})
})
