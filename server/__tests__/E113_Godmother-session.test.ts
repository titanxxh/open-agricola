import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { familySize, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E113_Godmother'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit48Crops from './_helpers/audit/ae-negative-48-crops'

const CARD_ID = 'E113_Godmother'

const setup = (round: number, rooms: number) => {
  const session = new GameSession(374)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((entry, index) => setWorkersAtHome(state, entry, index === 0 ? 2 : 0))
  const player = state.players[0]!
  player.rooms = rooms
  player.occupationPlayed.push(CARD_ID)
  session.loadState(state)
  return session
}

describe('E113 Godmother native session', () => {
  it('gains exactly 1 vegetable after Family Growth with room', () => {
    const session = setup(2, 3)
    const player = session.state.players[0]!
    const familyBefore = familySize(player)
    const vegetablesBefore = player.resources.vegetable
    const scoreBefore = session.getState().scores[0]!.total

    const response = session.takeAction(0, 'wish-children')

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(familyBefore + 1)
    expect(response.state.players[0]!.resources.vegetable).toBe(vegetablesBefore + 1)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.kind
      : response.interaction.stateId).toBe('confirm-next-player')
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: CARD_ID, gain: { vegetable: 1 } }),
    }))
    expect(response.scores[0]!.total).toBe(scoreBefore + 5)
  })

  it('gains exactly 1 vegetable after Family Growth without room', () => {
    const session = setup(5, 2)
    const player = session.state.players[0]!
    const familyBefore = familySize(player)
    const vegetablesBefore = player.resources.vegetable
    const scoreBefore = session.getState().scores[0]!.total

    const response = session.takeAction(0, 'urgent-wish-children')

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(familyBefore + 1)
    expect(response.state.players[0]!.resources.vegetable).toBe(vegetablesBefore + 1)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.kind
      : response.interaction.stateId).toBe('confirm-next-player')
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: CARD_ID, gain: { vegetable: 1 } }),
    }))
    expect(response.scores[0]!.total).toBe(scoreBefore + 5)
  })

  it('does not gain a vegetable after an unrelated action', () => {
    const session = setup(1, 2)
    const player = session.state.players[0]!
    const familyBefore = familySize(player)
    const vegetablesBefore = player.resources.vegetable
    const scoreBefore = session.getState().scores[0]!.total

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(familyBefore)
    expect(response.state.players[0]!.resources.vegetable).toBe(vegetablesBefore)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.kind
      : response.interaction.stateId).toBe('confirm-next-player')
    expect(response.state.log.some((entry) =>
      entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID,
    )).toBe(false)
    expect(response.scores[0]!.total).toBe(scoreBefore)
  })
})

describe('ae-negative-48-crops', () => {
  const { sessions, ok, save, setup, finish, next } = audit48Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E113 N1 ordinary and urgent real Family Growth give exactly one vegetable each', () => {
    for (const space of ['wish-children', 'urgent-wish-children']) {
      const s = setup('E113_Godmother', 14, state => {
        if (space === 'wish-children') {
          state.players[0]!.rooms = 3
          state.players[0]!.roomTiles.push({ row: 0, col: 0 })
        }
      })
      const r = finish(s, ok(s.takeAction(0, space)))
      assert.equal(familySize(r.state.players[0]!), 3)
      assert.equal(r.state.players[0]!.resources.vegetable, 1)
      assert.equal(r.state.players[1]!.resources.vegetable, 0)
      save(`E113-N1-${space}`, r)
    }
  })
  it('E113 N2 rejected no-room growth unrelated Forest and real opponent growth give owner no vegetable', () => { const s = setup('E113_Godmother', 14, state => { state.players[1]!.rooms = 3; state.players[1]!.roomTiles.push({ row: 0, col: 0 }); }); assertRejectedUnchanged(s, () => s.takeAction(0, 'wish-children')); finish(s, ok(s.takeAction(0, 'forest'))); next(s); const r = finish(s, ok(s.takeAction(1, 'wish-children'))); assert.equal(r.state.players[0]!.resources.vegetable, 0); assert.equal(r.state.players[1]!.resources.vegetable, 0); assert.equal(familySize(r.state.players[1]!), 3); save('E113-N2', r); })
})
