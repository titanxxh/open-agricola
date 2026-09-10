import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/D/D013_Trowel'

const CARD_ID = 'D013_Trowel'

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, houseType = 'wood', resources = {},
}: {
  played?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  resources?: Partial<{ wood: number; clay: number; reed: number; stone: number; food: number }>
} = {}) => {
  const session = new GameSession(6013, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.rooms = 2
  Object.assign(owner.resources, played ? resources : { wood: 1, ...resources })
  session.loadState(state)
  return session
}

const enterMinorChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinorChoice(session)
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const enterActiveInteraction = (session: GameSession) => {
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  return response
}

const anytimeIds = (response: SessionResponse) =>
  response.interaction.anytimeActions.map((action) => action.id)

describe('D013 Trowel parity', () => {
  it('D013 S1: paying one wood plays Trowel', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D013 S2: a two-room wood house renovates directly to stone for two stone, reed, and food', () => {
    const session = setup({ resources: { stone: 2, reed: 2, food: 2 } })
    const active = enterActiveInteraction(session)
    expect(anytimeIds(active)).toContain('D13-trowel-anytime')

    const response = session.takeAnytimeAction(0, 'D13-trowel-anytime')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { stone: 0, reed: 0, food: 0 },
    })
  })

  it('D013 S3: a two-room clay house renovates to stone for two stone without reed or food', () => {
    const session = setup({
      houseType: 'clay', resources: { stone: 2, reed: 3, food: 3 },
    })
    const active = enterActiveInteraction(session)
    expect(anytimeIds(active)).toContain('D13-trowel-anytime')

    const response = session.takeAnytimeAction(0, 'D13-trowel-anytime')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { stone: 0, reed: 3, food: 3 },
    })
  })

  it('D013 S5: a normal House Redevelopment still uses the normal wood-to-clay cost', () => {
    const response = setup({ resources: { clay: 2, reed: 1 } })
      .takeAction(0, 'house-redevelopment')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { clay: 0, reed: 0 },
    })
  })

  it('D013 S6: a stone house exposes no Trowel anytime renovation', () => {
    const response = enterActiveInteraction(setup({
      houseType: 'stone', resources: { stone: 2, reed: 2, food: 2 },
    }))

    expect(anytimeIds(response)).not.toContain('D13-trowel-anytime')
    expect(response.state.players[0]!.houseType).toBe('stone')
  })
})
