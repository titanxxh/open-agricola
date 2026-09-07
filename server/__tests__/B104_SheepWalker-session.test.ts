import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/B/B104_SheepWalker'
import '../../shared/cards/D/D124_Emissary'

const B104 = 'B104_SheepWalker'
const D124 = 'D124_Emissary'
const FILLER = '__test_placeholder__'

const setupWorkPhase = ({ played = true, accommodated = true } = {}) => {
  const session = new GameSession(5104, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    }
    player.pastures = []
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [B104]
  owner.occupationPlayed = played ? [B104] : []
  owner.resources.sheep = 1
  if (accommodated) {
    owner.pastures = [{
      id: 'sheep-pasture',
      size: 1,
      tiles: [{ row: 0, col: 0 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 1,
    }]
  }
  session.loadState(state)
  return session
}

const play = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(B104)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === B104)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('B104 Sheep Walker parity', () => {
  it('B104 S1: playing Sheep Walker through Lessons leaves it in play', () => {
    const response = play(setupWorkPhase({ played: false, accommodated: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(B104)
  })

  for (const [scenario, destination] of [
    ['S2', 'boar'],
    ['S3', 'vegetable'],
    ['S4', 'stone'],
  ] as const) {
    it(`B104 ${scenario}: an accommodated sheep can be exchanged for one ${destination}`, () => {
      const session = setupWorkPhase()

      let response = session.takeAnytimeAction(0, `B104-sheep-walker-${destination}`)

      expect(response.ok, response.error).toBe(true)
      if (destination === 'boar') {
        expect(response.interaction.stateId).toBe('wait')
        if (response.interaction.stateId !== 'wait') throw new Error('expected animal reorganization')
        expect(response.interaction.request.kind).toBe('animal-reorg')
        response = session.resolveChoice(0, 'confirm', {
          zones: [{
            id: 'sheep-pasture',
            zoneType: 'pasture',
            animalType: 'boar',
            animalCount: 1,
          }],
        })
      }
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.sheep).toBe(0)
      expect(response.state.players[0]!.resources[destination]).toBe(1)
    })
  }

  it.each(['boar', 'vegetable', 'stone'])('B104 S5: an unaccommodated sheep cannot be exchanged for %s', (destination) => {
    const session = setupWorkPhase({ accommodated: false })
    const before = session.getState()

    expect(before.interaction.anytimeActions.map((action) => action.id))
      .not.toContain(`B104-sheep-walker-${destination}`)
    const response = session.takeAnytimeAction(0, `B104-sheep-walker-${destination}`)

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.interaction).toEqual(before.interaction)
  })
})

const setupRound14 = (sheep: number) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 14
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = 10
  })
  const player = state.players[0]!
  player.startPlayer = true
  player.occupationPlayed.push(B104, D124)
  player.resources.sheep = sheep
  player.resources.wood = 1
  player.pastures = [{
    id: 'sheep-pasture',
    size: 2,
    tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    stables: 0,
    animalType: 'sheep',
    animalCount: sheep,
  }]
  state.players[1]!.startPlayer = false
  setActiveWorkerCount(state.players[1]!, 0)
  session.loadState(state)
  return session
}

const passFeed = (session: GameSession) => {
  let response = session.performRoundEnd()
  if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') {
    response = session.resolveChoice(0, '__skip__')
  }
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'feed') {
    response = session.resolveChoice(0, 'confirm', { selections: [] })
  }
  return response
}

describe('B104 Sheep Walker anytime timing', () => {
  it('B104 S6: uses the shared pre-scoring window instead of forcing a final reorganization', () => {
    const session = setupRound14(1)
    let response = passFeed(session)

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected pre-scoring window')
    expect(response.interaction.request.kind).toBe('choice')
    if (response.interaction.request.kind !== 'choice') throw new Error('expected choice')
    expect(response.interaction.request.options.filter((option) => option.sourceCard === B104)).toHaveLength(3)
    expect(response.interaction.request.options.some((option) => option.sourceCard === D124)).toBe(true)

    const stone = response.interaction.request.options.find((option) => option.labelKey === `cards.${B104}.stone`)
    expect(stone).toBeDefined()
    response = session.resolveChoice(0, stone!.value)
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    expect(response.state.players[0]!.resources.stone).toBe(1)

    response = session.resolveChoice(0, '__skip__')
    expect(response.state.gameOver).toBe(true)
  })

  it('B104 S7: hides Sheep Walker and Emissary while animal reorganization is pending', () => {
    const session = setupRound14(2)
    let response = passFeed(session)

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected reorganization')
    expect(response.interaction.request.kind).toBe('animal-reorg')
    expect(response.interaction.anytimeActions.map((action) => action.id).some((id) =>
      id.startsWith('B104-sheep-walker-') || id.startsWith('D124-emissary-'),
    )).toBe(false)

    response = session.resolveChoice(0, 'confirm', [
      { id: 'sheep-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 },
    ])

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected pre-scoring window')
    expect(response.interaction.request.kind).toBe('choice')
    if (response.interaction.request.kind !== 'choice') throw new Error('expected choice')
    expect(response.interaction.request.options.some((option) => option.sourceCard === B104)).toBe(true)
    expect(response.interaction.request.options.some((option) => option.sourceCard === D124)).toBe(true)
  })
})
