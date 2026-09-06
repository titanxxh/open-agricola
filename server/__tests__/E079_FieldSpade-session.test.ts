import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E079_FieldSpade'

const CARD_ID = 'E079_FieldSpade'
const FILLER = '__test_placeholder__'

type Crop = { row: number; col: number; crop: 'grain' | 'vegetable' }

const setup = ({
  card = 'played', wood = 1, grain = 0, vegetable = 0,
  fields = [{ row: 0, col: 0 }],
}: {
  card?: 'played' | 'hand' | 'absent'
  wood?: number
  grain?: number
  vegetable?: number
  fields?: { row: number; col: number }[]
} = {}) => {
  const session = new GameSession(7079, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.fields = []
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 20 : 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.minorHand = card === 'hand' ? [CARD_ID] : [FILLER]
  owner.minorPlayed = card === 'played' ? [CARD_ID] : []
  owner.fields = fields.map((field) => ({ ...field, stacks: [] }))
  Object.assign(owner.resources, { wood, grain, vegetable })
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let safety = 0; safety < 20 && response.state.players[0]!.minorHand.includes(CARD_ID); safety += 1) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') break
    const next = options(response).find((option) => option.value === CARD_ID)
      ?? options(response).find((option) => option.value !== '__skip__' && option.value !== 'cancel')
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

const sow = (session: GameSession, crops: Crop[]) => {
  let response = session.takeAction(0, 'grain-utilization')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait') {
    const sowOption = options(response).find((option) =>
      option.value === 'sow' || option.labelKey === 'actions.sow.name')
    if (sowOption) response = session.resolveChoice(response.interaction.playerIndex, sowOption.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
  })
  return session.commitSelectionChoice(0, { crops })
}

describe('E079 Field Spade parity', () => {
  it('E079 S1: paying one wood plays Field Spade', () => {
    const response = playMinor(setup({ card: 'hand', fields: [] }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('E079 S2: without one wood Field Spade is unavailable', () => {
    const session = setup({ card: 'hand', wood: 0, fields: [] })

    const response = session.takeAction(0, 'meeting-place')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })

  it('E079 S3: sowing one grain field gains exactly one stone', () => {
    const session = setup({ grain: 1 })

    const response = sow(session, [{ row: 0, col: 0, crop: 'grain' }])

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, stone: 1 })
  })

  it('E079 S4: sowing grain and vegetables in two fields still gains only one stone', () => {
    const session = setup({
      grain: 1, vegetable: 1, fields: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    })

    const response = sow(session, [
      { row: 0, col: 0, crop: 'grain' },
      { row: 0, col: 1, crop: 'vegetable' },
    ])

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.stone).toBe(1)
  })

  it('E079 S5: the same sow without Field Spade gains no stone', () => {
    const session = setup({ card: 'absent', grain: 1 })

    const response = sow(session, [{ row: 0, col: 0, crop: 'grain' }])

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, stone: 0 })
  })

  it('E079 S6: sowing after Cultivation also gains one stone', () => {
    const session = setup({ grain: 1, fields: [] })

    let response = session.takeAction(0, 'cultivation')
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    if (response.interaction.stateId !== 'wait') return
    const tile = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { tile })
    if (response.interaction.stateId === 'wait') {
      const sowOption = options(response).find((option) =>
        option.value === 'sow' || option.labelKey === 'actions.sow.name')
      if (sowOption) response = session.resolveChoice(response.interaction.playerIndex, sowOption.value)
    }
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
    })
    response = session.commitSelectionChoice(0, {
      crops: [{ ...tile, crop: 'grain' }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.stone).toBe(1)
  })
})
