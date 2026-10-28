import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { emptyResources } from '../../shared/contract/state-constants'
import { setWorkersAtHome } from '../../shared/domain/player'
import { collectCardsAs, getCardPrimaryType } from '../../shared/cards/helpers/card-type'
import { getLogicalFields } from '../../shared/cards/helpers/card-field'
import { countOccupations } from '../../shared/cards/helpers/prerequisites'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertUndoRestored, confirmNext, getChoiceOptions, undoRuleSnapshot } from './_helpers/session-assertions'

const TUTOR = 'B099_Tutor'
const DANCE_FLOOR = 'D025_WitchesDanceFloor'
const sessions: GameSession[] = []
afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

const setup = (configure?: (state: GameState) => void) => {
  const session = createWorkSession({ seed: 429011, configure(state) {
    state.round = 2
    for (const player of state.players) {
      setWorkersAtHome(state, player, 2)
      player.resources = { ...emptyResources, food: 20 }
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.extraOccupationsFromCards = []
      player.improvements = []
      player.cardStates = {}
      player.fields = []
      player.pastures = []
      player.stableTiles = []
      player.houseAnimals = {}
      player.stableAnimals = {}
      player.farmTerrain = []
      player.farmyardExtensions = []
      player.fenceSegments = []
      player.fences = 0
    }
    for (const space of state.actionSpaces) space.takenBy = []
    state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 1 }
    state.players[0]!.occupationHand = [TUTOR]
    state.players[0]!.minorHand = [DANCE_FLOOR]
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

const bonus = (response: SessionResponse) => response.scores[0]!.categories
  .flatMap(category => category.entries)
  .filter(entry => entry.type === 'bonus' && entry.cardId === TUTOR)
  .reduce((sum, entry) => sum + entry.score, 0)

const restore = (session: GameSession) => {
  const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  const restored = new GameSession(rehydrateState(snapshot))
  sessions.push(restored)
  return restored
}

const play = (session: GameSession, actor: number, cardId: string, kind: 'occupation' | 'minor') => {
  let response = session.takeAction(actor, kind === 'occupation' ? 'lessons' : 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  const played = () => kind === 'occupation' ? response.state.players[actor]!.occupationPlayed
    : response.state.players[actor]!.minorPlayed
  for (let step = 0; step < 3 && !played().includes(cardId); step++) {
    assert.equal(response.interaction.stateId, 'wait', JSON.stringify(response.interaction))
    const option = getChoiceOptions(response).find(option => option.value === cardId)
      ?? getChoiceOptions(response).find(option => option.value.startsWith('action-improvement-'))
    assert.ok(option, JSON.stringify(response.interaction))
    response = session.resolveChoice(actor, option.value)
    expect(response.ok, response.error).toBe(true)
  }
  expect(played()).toContain(cardId)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  return response
}

const opponentForest = (session: GameSession, previous: SessionResponse) => {
  confirmNext(session, previous)
  const response = session.takeAction(1, 'forest')
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[1]!.resources.wood).toBe(1)
  return confirmNext(session, response)
}

describe('Tutor logical occupation scoring', () => {
  it('scores a later Dance Floor once after real Lessons and Meeting Place plays', () => {
    const session = setup()
    const tutor = play(session, 0, TUTOR, 'occupation')
    expect(readCardExtraData(tutor.state.players[0]!, TUTOR, 'playedAtCount')).toBe(1)
    expect(bonus(tutor)).toBe(0)
    opponentForest(session, tutor)

    const response = play(session, 0, DANCE_FLOOR, 'minor')

    const player = response.state.players[0]!
    expect(player.occupationPlayed).toEqual([TUTOR])
    expect(player.minorPlayed).toEqual([DANCE_FLOOR])
    expect(player.extraOccupationsFromCards).toEqual([DANCE_FLOOR])
    expect(session.withCtx(() => countOccupations(player))).toBe(2)
    expect(session.withCtx(() => getCardPrimaryType(DANCE_FLOOR))).toBe('minor')
    expect(session.withCtx(() => collectCardsAs(player, 'major'))).toEqual([DANCE_FLOOR])
    expect(session.withCtx(() => getLogicalFields(player))).toHaveLength(1)
    expect(player.resources.food).toBe(20)
    expect(bonus(response)).toBe(1)
    expect(response.scores[0]!.categories.find(category => category.key === 'cards')!.entries
      .filter(entry => entry.type === 'card' && entry.cardId === DANCE_FLOOR))
      .toEqual([{ type: 'card', cardId: DANCE_FLOOR, cardType: 'minor', score: 0 }])
    expect(response.state.events.filter(event => event.type === 'card.played')
      .map(event => ({ cardId: event.cardId, cardType: event.cardType })))
      .toEqual([{ cardId: TUTOR, cardType: 'occupation' }, { cardId: DANCE_FLOOR, cardType: 'minor' }])
    expect(response.state.log.filter(entry => entry.key === 'log.playOccupation').map(entry => entry.params?.occupations))
      .toEqual([TUTOR])
    expect(response.state.log.filter(entry => entry.key === 'log.playMinorImprovement').map(entry => entry.params?.improvements))
      .toEqual([DANCE_FLOOR])
  })

  it('includes an earlier Dance Floor in the Tutor baseline and awards no point for it', () => {
    const session = setup()
    expect(bonus(session.getState())).toBe(0)
    const danceFloor = play(session, 0, DANCE_FLOOR, 'minor')
    expect(bonus(danceFloor)).toBe(0)
    expect(danceFloor.state.players[0]!.occupationHand).toEqual([TUTOR])
    expect(readCardExtraData(danceFloor.state.players[0]!, TUTOR, 'playedAtCount')).toBeUndefined()
    opponentForest(session, danceFloor)

    const response = play(session, 0, TUTOR, 'occupation')

    expect(session.withCtx(() => countOccupations(response.state.players[0]!))).toBe(2)
    expect(readCardExtraData(response.state.players[0]!, TUTOR, 'playedAtCount')).toBe(2)
    expect(bonus(response)).toBe(0)
  })

  it('ignores the opponent playing both Dance Floor and an ordinary occupation', () => {
    const session = setup(state => {
      state.players[1]!.minorHand = [DANCE_FLOOR]
      state.players[1]!.occupationHand = ['A143_Stonecutter']
      state.players[0]!.minorHand = ['__test_placeholder__']
    })
    const tutor = play(session, 0, TUTOR, 'occupation')
    confirmNext(session, tutor)
    const opponentMinor = play(session, 1, DANCE_FLOOR, 'minor')
    expect(bonus(opponentMinor)).toBe(0)
    confirmNext(session, opponentMinor)
    const ownerForest = session.takeAction(0, 'forest')
    expect(ownerForest.ok, ownerForest.error).toBe(true)
    confirmNext(session, ownerForest)
    const opponentClay = session.takeAction(1, 'clay-pit')
    expect(opponentClay.ok, opponentClay.error).toBe(true)
    const nextRound = confirmNext(session, opponentClay)
    expect(nextRound.state.round).toBe(3)
    expect(nextRound.state.currentPlayerIndex).toBe(1)

    const response = play(session, 1, 'A143_Stonecutter', 'occupation')

    expect(response.state.players[0]!.occupationPlayed).toEqual([TUTOR])
    expect(session.withCtx(() => countOccupations(response.state.players[0]!))).toBe(1)
    expect(session.withCtx(() => countOccupations(response.state.players[1]!))).toBe(2)
    expect(bonus(response)).toBe(0)
  })

  it('restores both score states without redealing and can undo and replay the real minor purchase', () => {
    const original = setup()
    const tutor = play(original, 0, TUTOR, 'occupation')
    const beforeDanceFloor = opponentForest(original, tutor)
    const beforeUndo = undoRuleSnapshot(beforeDanceFloor)
    const session = restore(original)
    expect(session.getState().state.players[0]!.occupationHand).toEqual([])
    expect(session.getState().state.players[0]!.minorHand).toEqual([DANCE_FLOOR])
    expect(readCardExtraData(session.state.players[0]!, TUTOR, 'playedAtCount')).toBe(1)
    expect(bonus(session.getState())).toBe(0)

    const played = play(session, 0, DANCE_FLOOR, 'minor')
    expect(bonus(played)).toBe(1)
    const stateBeforeQueries = JSON.stringify(session.state)
    for (let query = 0; query < 3; query++) expect(session.getState().scores).toEqual(played.scores)
    expect(JSON.stringify(session.state)).toBe(stateBeforeQueries)

    const recovered = restore(session)
    const response = recovered.getState()
    expect(response.scores).toEqual(played.scores)
    expect(response.state.players[0]!.occupationHand).toEqual([])
    expect(response.state.players[0]!.minorHand).toEqual([])
    expect(readCardExtraData(response.state.players[0]!, TUTOR, 'playedAtCount')).toBe(1)

    const undone = recovered.undoAction()
    assertUndoRestored(beforeUndo, undone)
    expect(bonus(undone)).toBe(0)
    expect(undone.state.players[0]!.minorHand).toEqual([DANCE_FLOOR])
    expect(undone.state.players[0]!.extraOccupationsFromCards).toEqual([])

    const replayed = play(recovered, 0, DANCE_FLOOR, 'minor')
    expect(bonus(replayed)).toBe(1)
    expect(replayed.scores).toEqual(played.scores)
    expect(replayed.state.events.filter(event => event.type === 'card.played' && event.cardId === DANCE_FLOOR))
      .toHaveLength(1)
  })
})
