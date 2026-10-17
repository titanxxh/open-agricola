import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { computeScores } from '../../shared/domain/scoring'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmNextPlayer } from './_helpers/pending-confirms'

import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/B/B099_Tutor'
import '../../shared/cards/B/B121_Geologist'
import './_helpers/audit/ae-negative-B099'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext } from './_helpers/negative-rule-audit'

const CARD_ID = 'B099_Tutor'
const BEFORE = 'B121_Geologist'
const AFTER = 'A116_WoodCutter'
const FILLER = '__test_placeholder__'

const setup = ({ previousOccupation = false, laterOccupation = false } = {}) => {
  const session = new GameSession(5099, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const owner = state.players[0]!
  owner.occupationPlayed = previousOccupation ? [BEFORE] : []
  owner.occupationHand = laterOccupation ? [CARD_ID, AFTER] : [CARD_ID]
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, playerIndex: number, actionId: string, cardId: string) => {
  const response = session.takeAction(playerIndex, actionId)
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[playerIndex]!.occupationHand.includes(cardId)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const takeTurn = (session: GameSession, playerIndex: number, actionId: string) => {
  let response = confirmNextPlayer(session)
  expect(response.ok, response.error).toBe(true)
  expect(response.state.currentPlayerIndex).toBe(playerIndex)
  response = session.takeAction(playerIndex, actionId)
  expect(response.ok, response.error).toBe(true)
  return response
}

const returnTurnToOwner = (session: GameSession) => {
  takeTurn(session, 1, 'forest')
  takeTurn(session, 2, 'clay-pit')
  takeTurn(session, 3, 'reed-bank')
  const response = confirmNextPlayer(session)
  expect(response.ok, response.error).toBe(true)
  expect(response.state.currentPlayerIndex).toBe(0)
  return response
}

const tutorBonus = (session: GameSession, response: SessionResponse) =>
  session.withCtx(() => computeScores(response.state))[0]!.categories
    .find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score ?? 0

describe('B099 Tutor parity', () => {
  it('B099 S1: playing Tutor through Lessons records the current occupation count', () => {
    const response = playOccupation(setup({ previousOccupation: true }), 0, 'lessons', CARD_ID)

    expect(response.state.players[0]!.occupationPlayed).toEqual([BEFORE, CARD_ID])
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'playedAtCount')).toBe(2)
  })

  it('B099 S2: one occupation played after Tutor scores one point while an earlier occupation is ignored', () => {
    const session = setup({ previousOccupation: true, laterOccupation: true })
    playOccupation(session, 0, 'lessons', CARD_ID)
    returnTurnToOwner(session)

    const response = playOccupation(session, 0, 'lessons-4', AFTER)

    expect(response.state.players[0]!.occupationPlayed).toEqual([BEFORE, CARD_ID, AFTER])
    expect(tutorBonus(session, response)).toBe(1)
  })

  it('B099 S3: Tutor scores zero when no occupation is played after it', () => {
    const session = setup({ previousOccupation: true })
    const response = playOccupation(session, 0, 'lessons', CARD_ID)

    expect(tutorBonus(session, response)).toBe(0)
  })
})

describe('ae-negative-B099', () => {
  it('B099 N1 real earlier, own and opponent occupations score zero; later own play, undo and retry score 1/0/1', () => {
    const session = createWorkSession({ seed: 99, configure: state => {
      state.players[0]!.occupationHand = ['B121_Geologist', 'B099_Tutor', 'A116_WoodCutter']
      state.players[1]!.occupationHand = ['A143_Stonecutter']
      state.players.forEach(p => { p.resources.food = 20 })
    } })
    const bonus = (r: SessionResponse) => r.scores?.[0]?.categories.find(c => c.key === 'cardBonusVp')?.total ?? 0
    const take = (actor: number, space: string, card?: string) => {
      const before = session.getState()
      if (before.interaction.stateId === 'wait' && before.interaction.request.kind === 'confirm-next-player') confirmNext(session, before)
      assert.equal(session.getState().state.currentPlayerIndex, actor)
      let r = session.takeAction(actor, space)
      assert.equal(r.ok, true, r.error)
      if (card && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value === card)) {
        assertRejectedUnchanged(session, () => session.resolveChoice(actor, '__missingOccupation__'))
        r = session.resolveChoice(actor, card)
        assert.equal(r.ok, true, r.error)
      }
      if (card) assert.ok(r.state.players[actor]!.occupationPlayed.includes(card))
      return r
    }
    try {
      take(0, 'lessons', 'B121_Geologist')
      take(1, 'forest')
      take(0, 'clay-pit')
      take(1, 'reed-bank')
      const tutor = take(0, 'lessons', 'B099_Tutor')
      assert.equal(tutor.state.round, 2)
      assert.equal(bonus(tutor), 0)
      take(1, 'forest')
      take(0, 'clay-pit')
      take(1, 'reed-bank')
      take(0, 'forest')
      const opponent = take(1, 'lessons', 'A143_Stonecutter')
      assert.equal(opponent.state.round, 3)
      assert.equal(bonus(opponent), 0)
      take(0, 'clay-pit')
      take(1, 'reed-bank')
      const later = take(0, 'lessons', 'A116_WoodCutter')
      assert.equal(later.state.round, 4)
      assert.equal(bonus(later), 1)
      const undone = session.undoAction()
      assert.equal(undone.ok, true, undone.error)
      assert.equal(bonus(undone), 0)
      assert.deepEqual(undone.state.players[0]!.occupationPlayed, ['B121_Geologist', 'B099_Tutor'])
      assert.ok(undone.state.players[0]!.occupationHand.includes('A116_WoodCutter'))
      const retry = take(0, 'lessons', 'A116_WoodCutter')
      assert.equal(bonus(retry), 1)
      assert.equal(retry.state.events.filter(event => event.type === 'card.played' && event.cardId === 'A116_WoodCutter').length, 1)
    } finally { session.dispose() }
  })
})
