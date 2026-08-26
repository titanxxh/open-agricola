import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'

import '../../shared/cards/B/B104_SheepWalker'
import '../../shared/cards/D/D124_Emissary'

const B104 = 'B104_SheepWalker'
const D124 = 'D124_Emissary'

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
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'feed') {
    response = session.resolveChoice(0, 'confirm', { selections: [] })
  }
  return response
}

describe('B104 Sheep Walker anytime timing', () => {
  it('uses the shared pre-scoring window instead of forcing a final reorganization', () => {
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

  it('hides Sheep Walker and Emissary while animal reorganization is pending', () => {
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
