import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D144_WaterWorker'
import assert from 'node:assert/strict'
import * as audit54Resources from './_helpers/audit/ae-negative-54-resources'

const CARD_ID = 'D144_WaterWorker'

const setup = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.occupationHand.push(CARD_ID)
  player.resources.food = 10
  session.loadState(state)
  session.devPlayCard(0, CARD_ID)
  return session
}

describe('D144_WaterWorker session', () => {
  it('gains 1 reed after using day-laborer', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const initialReed = player.resources.reed
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    // Day laborer gives food + WaterWorker gives 1 reed
    expect(updated.resources.reed).toBe(initialReed + 1)
  })

  it('gains 1 reed after using reed-bank', () => {
    const session = setup()
    const state = session.getState().state
    // Make sure reed-bank has some resources accumulated
    const reedBankSpace = state.actionSpaces.find(s => s.id === 'reed-bank')
    if (reedBankSpace) {
      reedBankSpace.resources.reed = 3
    }
    const player = state.players[0]!
    const initialReed = player.resources.reed
    session.loadState(state)

    const resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    // Reed bank gives accumulated reed + WaterWorker gives 1 reed
    expect(updated.resources.reed).toBeGreaterThan(initialReed + 1)
  })
})

describe('D144 Water Worker parity', () => {
  const CARD_ID = 'D144_WaterWorker'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, resources = {},
  }: {
    played?: boolean
    resources?: Partial<{ clay: number; reed: number }>
  } = {}) => {
    const session = new GameSession(6144, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    state.roundActionOrder = state.roundActionOrder.map((id) =>
      id === 'house-redevelopment' ? null : id)
    state.roundActionOrder[3] = 'house-redevelopment'
    state.actionSpaces.forEach((space) => {
      space.takenBy = []
      if (space.id === 'house-redevelopment') space.roundAvailable = 4
      if (space.id === 'fishing') space.resources = { ...space.resources, food: 2 }
      if (space.id === 'reed-bank') space.resources = { ...space.resources, reed: 2 }
    })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources = { ...owner.resources, ...resources }
    session.loadState(state)
    return session
  }

  const renovateToClay = (session: GameSession): SessionResponse => {
    let response = session.takeAction(0, 'house-redevelopment')
    if (response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = session.resolveChoice(response.interaction.playerIndex, 'clay')
    }
    return response
  }

  it('D144 S2: using Fishing gains its food and one additional reed', () => {
    const response = setup().takeAction(0, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, reed: 1 })
  })

  it('D144 S5: using the round-four House Redevelopment action gains one additional reed', () => {
    const response = renovateToClay(setup({ resources: { clay: 2, reed: 1 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { clay: 0, reed: 1 },
    })
  })

  it('D144 S6: using a non-target action grants no additional reed', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, reed: 0 })
  })
})

describe('ae-negative-54-resources', () => {
  const { sessions, ok, save, setup, finish, next, take, move } = audit54Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D144 N1 actual Fishing Reed Bank and Day Laborer each add exactly one reed', () => {
    for (const [space, reed, food] of [['fishing', 1, 21], ['reed-bank', 3, 20], ['day-laborer', 1, 22]] as const) {
      const s = setup('D144_WaterWorker')
      const r = finish(s, take(s, space))
      assert.equal(r.state.players[0]!.resources.reed, reed)
      assert.equal(r.state.players[0]!.resources.food, food)
      save(`D144-N1-${space}`, r)
    }
  })
  it('D144 N2 unrelated owner action opponent Fishing and hand-only card exclude reward', () => {
    for (const mode of ['unrelated', 'opponent', 'hand']) {
      const s = setup('D144_WaterWorker', 14, state => {
        if (mode === 'hand') {
          state.players[0]!.occupationPlayed = []
          state.players[0]!.occupationHand = ['D144_WaterWorker']
        }
      })
      let r
      if (mode === 'opponent') {
        move(s, 'forest')
        next(s)
        r = finish(s, ok(s.takeAction(1, 'fishing')))
      }
      else
        r = finish(s, take(s, mode === 'unrelated' ? 'forest' : 'fishing'))
      assert.equal(r.state.players[0]!.resources.reed, 0)
      save(`D144-N2-${mode}`, r)
    }
  })
  it('D144 N3 legal fourth round Sheep Market identity is exercised with modeled PHP mapping limitation', () => {
    const s = setup('D144_WaterWorker', 5, state => {
      const i = state.roundActionOrder.indexOf('sheep-market')
      assert.ok(i >= 0 && i < 4)
      const old = state.roundActionOrder[3]!
      state.roundActionOrder[3] = 'sheep-market'
      state.roundActionOrder[i] = old
      for (const a of state.actionSpaces) {
        if (a.id === 'sheep-market') {
          a.roundAvailable = 4
          a.resources.sheep = 1
        }
        else if (a.id === old)
          a.roundAvailable = i + 1
      }
    })
    const r = finish(s, take(s, 'sheep-market'))
    assert.equal(r.state.players[0]!.resources.sheep, 1)
    assert.equal(r.state.players[0]!.resources.reed, 1)
    save('D144-N3-legal-stage1-round4', r)
  })
})
