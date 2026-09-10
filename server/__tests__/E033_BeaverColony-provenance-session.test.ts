import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E033_BeaverColony'

const CARD_ID = 'E033_BeaverColony'
const FILLER = '__test_placeholder__'

const setup = ({ played = false, pastures = [] as number[] } = {}) => {
  const session = new GameSession(6033, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.pastures = []
    player.stableTiles = []
    player.fenceSegments = []
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.sheep = pastures.reduce((sum, count) => sum + count, 0)
  owner.pastures = pastures.map((animalCount, index) => ({
    id: `beaver-pasture-${index + 1}`,
    size: 1,
    tiles: [{ row: 0, col: index + 2 }],
    stables: 1,
    animalType: animalCount > 0 ? 'sheep' as const : null,
    animalCount,
  }))
  owner.stableTiles = pastures.map((_count, index) => ({ row: 0, col: index + 2 }))
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const bonusVp = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0

describe('E033 Beaver Colony parity', () => {
  it('E033 S1: Beaver Colony requires a fenced stable and contributes one printed point', () => {
    const blocked = enterMinor(setup())
    expect(options(blocked).some((option) => option.value === CARD_ID)).toBe(false)
    expect(blocked.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(blocked.state.players[0]!.minorPlayed).not.toContain(CARD_ID)

    const response = play(setup({ pastures: [0] }))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })

  it('E033 S2: playing with every stabled pasture occupied forces one to be emptied', () => {
    const session = setup({ pastures: [1, 1] })
    let response = play(session)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'animal-reorg' },
    })
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind !== 'animal-reorg') return
    const occupied = response.interaction.request.zones.find((zone) =>
      zone.id === 'beaver-pasture-1')
    expect(occupied).toBeDefined()

    response = session.resolveChoice(response.interaction.playerIndex, 'confirm', {
      zones: [{ ...occupied!, animalType: 'sheep', animalCount: 2 }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'beaver-pasture-1', animalCount: 2 }),
      expect.objectContaining({ id: 'beaver-pasture-2', animalCount: 0 }),
    ]))
  })

  it('E033 S3: an already empty stabled pasture needs no reorganization on play', () => {
    const response = play(setup({ pastures: [1, 0] }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : 'idle')
      .not.toBe('animal-reorg')
  })

  it('E033 S4: collecting any amount of reed from Reed Bank grants one bonus point', () => {
    const session = setup({ played: true, pastures: [0] })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 3
    session.loadState(state)

    const response = session.takeAction(0, 'reed-bank')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.reed).toBe(3)
    expect(bonusVp(response)).toBe(1)
  })

  it('E033 S5: Resource Market reed grants one bonus point', () => {
    const response = setup({ played: true, pastures: [0] }).takeAction(0, 'resource-market-4')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.reed).toBe(1)
    expect(bonusVp(response)).toBe(1)
  })

  it('E033 S6: an action space without reed grants no Beaver Colony point', () => {
    const session = setup({ played: true, pastures: [0] })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(bonusVp(response)).toBe(0)
  })
})
