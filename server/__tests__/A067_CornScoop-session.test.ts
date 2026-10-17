import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A067_CornScoop'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit09Sources from './_helpers/audit/ae-negative-09-sources'

const CARD_ID = 'A067_CornScoop'
const FILLER = '__test_placeholder__'

const setup = ({ played = true, wood = 0, actor = 0 } = {}) => {
  const session = new GameSession(5067, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 1
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.grain = 0
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.wood = wood
  session.loadState(state)
  return session
}

const playCornScoop = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const improvement = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

describe('A067 Corn Scoop parity', () => {
  it('A067 S1: Corn Scoop costs one wood to play', () => {
    const response = playCornScoop(setup({ played: false, wood: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A067 S2: Grain Seeds gives its grain plus one additional grain', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(2)
  })

  it('A067 S3: a different action space gives no additional grain', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('A067 S4: another player using Grain Seeds gives the owner no grain', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[1]!.resources.grain).toBe(1)
  })
})

describe('ae-negative-09-sources', () => {
  const { SCOOP, sessions, save, setup, buy, deny, ready, turn, market, collect } = audit09Sources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A067 N1 actual one wood purchase awards no grain', () => { deny(setup(SCOOP, { played: false }), SCOOP); const r = buy(setup(SCOOP, { played: false, resources: { wood: 1 } }), SCOOP); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.grain, 0) })
  it('A067 N2 Grain Seeds gives exactly its base grain plus one extra', () => { const s = setup(SCOOP, { played: false, resources: { wood: 1 } }); buy(s, SCOOP); turn(s, 1, 'forest'); const r = turn(s, 0, 'grain-seeds'); assert.equal(r.state.players[0]!.resources.grain, 2); assert.equal(r.state.log.filter(e => e.key === 'log.cardTriggered' && e.params?.cardId === SCOOP).length, 1) })
  it('A067 N3 grain granted by Feeding Dish is not Grain Seeds', () => { const s = market('sheep', 1, 1, true, state => state.players[0]!.minorPlayed.push(SCOOP)); const r = collect(s, 'sheep'); assert.equal(r.state.players[0]!.resources.sheep, 2); assert.equal(r.state.players[0]!.resources.grain, 1) })
  it('A067 N4 unplayed owner and opponent Grain Seeds have no extra owner grain', () => { let r = turn(setup(SCOOP, { played: false }), 0, 'grain-seeds'); assert.equal(r.state.players[0]!.resources.grain, 1); const s = setup(SCOOP); turn(s, 0, 'forest'); r = turn(s, 1, 'grain-seeds'); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(r.state.players[1]!.resources.grain, 1) })
  it('A067 N5 repeated occupied Grain Seeds request cannot repeat the bonus', () => { const s = setup(SCOOP); turn(s, 0, 'grain-seeds'); turn(s, 1, 'clay-pit'); ready(s, 0); assertRejectedUnchanged(s, () => s.takeAction(1, 'forest')); assertRejectedUnchanged(s, () => s.takeAction(0, 'grain-seeds')); assert.equal(turn(s, 0, 'forest').state.players[0]!.resources.grain, 2) })
  it('A067 N6 actual Grain Seeds undo and retry do not duplicate the extra grain', () => { const s = setup(SCOOP), before = undoRuleSnapshot(s.getState()); turn(s, 0, 'grain-seeds'); assertUndoRestored(before, s.undoAction()); assert.equal(turn(s, 0, 'grain-seeds').state.players[0]!.resources.grain, 2); save('A067-N6-undo-retry', s.getState()) })
})
