import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from './_helpers/round-end'

import '../../shared/cards/A/A104_WoodHarvester'
import assert from 'node:assert/strict'
import { confirmNext } from './_helpers/negative-rule-audit'
import * as audit12ResourceSource from './_helpers/audit/ae-negative-12-resource-source'

const CARD_ID = 'A104_WoodHarvester'
const FILLER = '__test_placeholder__'

const setup = ({ played = true, spaceWood = {} as Record<string, number> } = {}) => {
  const session = new GameSession(5104, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = played ? 4 : 1
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = played ? 20 : 0
    player.resources.wood = 0
    if (played) markAllWorkersUsed(state, player)
    else setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  state.actionSpaces.forEach((space) => {
    space.resources.wood = spaceWood[space.id] ?? 0
  })
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('A104 Wood Harvester parity', () => {
  it('A104 S1: Wood Harvester is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A104 S2: each qualifying wood accumulation space grants its threshold reward at harvest', () => {
    const response = autoAdvanceRoundEnd(setup({ spaceWood: { forest: 2, grove: 3, copse: 4 } }))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 18 })
  })

  it('A104 S3: wood accumulation spaces below two wood grant nothing', () => {
    const response = autoAdvanceRoundEnd(setup({ spaceWood: { forest: 1, grove: 0, copse: 1 } }))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 16 })
  })

  it('A104 S4: ignores wood sitting on non-wood accumulation spaces', () => {
    const response = autoAdvanceRoundEnd(setup({ spaceWood: { 'clay-pit': 2, 'reed-bank': 3 } }))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 16 })
  })
})

describe('ae-negative-12-resource-source', () => {
  const { WOOD, sessions, save, setup, turn, harvest } = audit12ResourceSource
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('A104 N1 natural round four harvest reads zero one two three and five wood thresholds', () => {
    for (const amount of [0, 1, 2, 3, 5]) {
      const session = setup(WOOD, state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = amount, true, 4)
      const response = harvest(session); assert.equal(response.state.players[0]!.resources.wood, Number(amount === 2)); assert.equal(response.state.players[0]!.resources.food, 38 + Number(amount >= 3)); assert.equal(response.state.actionSpaces.find(s => s.id === 'forest')!.resources.wood, amount + 3); save(`A104-N1-${amount}`, response)
    }
  })
  it('A104 N2 nonharvest round and unplayed card cannot grant wood pile rewards', () => {
    const session = setup(WOOD, state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 2)
    turn(session, 0, 'grain-seeds'); turn(session, 1, 'reed-bank'); turn(session, 0, 'day-laborer'); const response = confirmNext(session, turn(session, 1, 'clay-pit'))
    assert.equal(response.state.round, 6); assert.equal(response.state.players[0]!.resources.wood, 0); assert.equal(response.state.players[0]!.resources.food, 42)
    const unplayed = harvest(setup(WOOD, state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 2, false, 4)); assert.equal(unplayed.state.players[0]!.resources.wood, 0); save('A104-N2', { response, unplayed })
  })
  it('A104 N3 owner reward cannot transfer to opponent and ordinary collection is not harvest', () => {
    const session = setup(WOOD, state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 2, true, 4)
    const response = harvest(session); assert.equal(response.state.players[0]!.resources.wood, 1); assert.equal(response.state.players[1]!.resources.wood, 0)
    const collected = turn(setup(WOOD, state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 2), 0, 'forest'); assert.equal(collected.state.players[0]!.resources.wood, 2); assert.equal(collected.state.players[0]!.resources.food, 40); save('A104-N3', { response, collected })
  })
})
