import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/C/C048_Farmstead'

const CARD_ID = 'C048_Farmstead'

const FILLER = '__test_placeholder__'

const STABLE_TILE = { row: 0, col: 2 }

const STABLE_FENCES = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3']

const setup = ({
  played = true,
  occupation = true,
  resources = {},
}: {
  played?: boolean
  occupation?: boolean
  resources?: Partial<{ wood: number; reed: number; food: number }>
} = {}) => {
  const session = new GameSession(48, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    }
  })

  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.occupationPlayed = occupation ? ['B113_PatchCaregiver'] : []
  player.resources = { ...player.resources, ...resources }

  session.loadState(state)
  return session
}

const enterMinorChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinorChoice(session)
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) =>
    option.value === CARD_ID || option.value === 'minor:' + CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const buildRoomAndStable = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  let builtRoom = false
  let builtStable = false
  for (let guard = 0; guard < 20 && response.interaction.stateId === 'wait'; guard += 1) {
    if (response.interaction.request.kind === 'farm-select') {
      const tile = response.interaction.request.farm.selectableTiles[0]
      expect(tile).toBeDefined()
      if (response.interaction.request.farm.farmType === 'room') {
        response = session.commitSelectionChoice(response.interaction.playerIndex, { rooms: [tile!] })
        builtRoom = true
        continue
      }
      if (response.interaction.request.farm.farmType === 'stable') {
        response = session.commitSelectionChoice(response.interaction.playerIndex, { stables: [tile!] })
        builtStable = true
        continue
      }
    }
    const options = response.interaction.request.options ?? []
    const room = options.find((option) => option.labelKey === 'actions.construct.name')
    const stable = options.find((option) =>
      option.labelKey === 'actions.stables.name'
      || option.labelKey === 'actions.buildStables.name')
    const done = options.find((option) => option.value === '__done__')
    if (!builtRoom && room) {
      response = session.resolveChoice(response.interaction.playerIndex, room.value)
      continue
    }
    if (!builtStable && stable) {
      response = session.resolveChoice(response.interaction.playerIndex, stable.value)
      continue
    }
    if (done) {
      response = session.resolveChoice(response.interaction.playerIndex, done.value)
      continue
    }
    break
  }
  return response
}

describe('C048 Farmstead parity', () => {
  it('C048 S1: one occupation allows Farmstead to be played for free', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('C048 S2: without an occupation Farmstead remains unavailable', () => {
    const response = enterMinorChoice(setup({ played: false, occupation: false }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) =>
        option.value === CARD_ID || option.value === 'minor:' + CARD_ID) ?? false
      : false).toBe(false)
  })

  it('C048 S3: plowing one unused farmyard space gains one food', () => {
    const session = setup()
    let response = session.takeAction(0, 'farmland')
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind !== 'farm-select') return
    const tile = response.interaction.request.farm.selectableTiles[0]
    expect(tile).toBeDefined()
    response = session.commitSelectionChoice(response.interaction.playerIndex, { tile })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('C048 S4: building a room and stable in one turn gains only one food', () => {
    const response = buildRoomAndStable(setup({ resources: { wood: 7, reed: 2 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('C048 S5: fencing an already used stable space gains no food', () => {
    const session = setup({ resources: { wood: 4 } })
    const state = session.getState().state
    state.players[0]!.stableTiles = [STABLE_TILE]
    session.loadState(state)

    let response = session.takeAction(0, 'fencing')
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
    })
    response = session.commitSelectionChoice(0, {
      edges: STABLE_FENCES, palisadeEdges: [], extraWood: 0,
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C048 S6: a turn that uses no new farmyard space gains no food', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })
})
