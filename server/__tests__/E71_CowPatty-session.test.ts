import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { ActionChoiceOption, FarmTilePosition } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E071_CowPatty'

const CARD_ID = 'E071_CowPatty'
const FILLER = '__test_placeholder__'

type Crop = 'grain' | 'vegetable'
type FieldSpec = { row: number; col: number }

const PASTURE = {
  id: 'cow-patty-pasture',
  size: 1,
  tiles: [{ row: 1, col: 2 }],
  stables: 0,
  animalType: null,
  animalCount: 0,
} as const

const setup = ({
  played = false, cattleOnFarm = true, cattleInReserve = 0, grain = 0, vegetable = 0,
  fields = [], pasture = true,
}: {
  played?: boolean
  cattleOnFarm?: boolean
  cattleInReserve?: number
  grain?: number
  vegetable?: number
  fields?: FieldSpec[]
  pasture?: boolean
} = {}) => {
  const session = new GameSession(7071, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.grain = grain
  owner.resources.vegetable = vegetable
  owner.resources.cattle = cattleInReserve
  owner.fields = fields.map(({ row, col }) => ({ row, col, stacks: [] }))
  owner.pastures = pasture ? [{ ...PASTURE, tiles: [...PASTURE.tiles] }] : []
  if (cattleOnFarm) {
    owner.houseAnimalType = 'cattle'
    owner.houseAnimalCount = 1
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
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

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && options(response).some((option) => option.value === CARD_ID)

const sow = (session: GameSession, crops: Array<FieldSpec & { crop: Crop }>) => {
  const action = session.takeAction(0, 'grain-utilization')
  expect(action.ok, action.error).toBe(true)
  return session.commitSelectionChoice(0, { crops })
}

const acceptCowPatty = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected Cow Patty optional choice')
  const accept = response.interaction.request.options?.find((option: ActionChoiceOption) =>
    option.value !== '__skip__' && option.sourceCard === CARD_ID)
  expect(accept, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

const select = (session: GameSession, positions: FarmTilePosition[]) =>
  session.commitSelectionChoice(0, { positions })

const cropCount = (response: SessionResponse, crop: Crop, row: number, col: number) =>
  response.state.players[0]!.fields.find((field) => field.row === row && field.col === col)
    ?.stacks.find((stack) => stack.kind === crop)?.remaining ?? 0

describe('E071 Cow Patty parity', () => {
  it('E071 S1: one cattle on the farm allows Cow Patty to be played for no resources', () => {
    const response = play(setup({ pasture: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.houseAnimalCount).toBe(1)
  })

  it('E071 S2: without cattle Cow Patty remains unavailable', () => {
    const response = enterMinor(setup({ cattleOnFarm: false, pasture: false }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('E071 S3: cattle in the reserve does not satisfy Cow Patty prerequisite', () => {
    const response = enterMinor(setup({
      cattleOnFarm: false, cattleInReserve: 1, pasture: false,
    }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.cattle).toBe(1)
  })

  it('E071 S4: accepting after sowing grain beside a pasture adds one grain', () => {
    const session = setup({ played: true, grain: 1, fields: [{ row: 1, col: 3 }] })

    let response = acceptCowPatty(session, sow(session, [
      { row: 1, col: 3, crop: 'grain' },
    ]))
    response = select(session, [{ row: 1, col: 3 }])

    expect(response.ok, response.error).toBe(true)
    expect(cropCount(response, 'grain', 1, 3)).toBe(4)
  })

  it('E071 S5: accepting after sowing vegetables beside a pasture adds one vegetable', () => {
    const session = setup({ played: true, vegetable: 1, fields: [{ row: 1, col: 3 }] })

    let response = acceptCowPatty(session, sow(session, [
      { row: 1, col: 3, crop: 'vegetable' },
    ]))
    response = select(session, [{ row: 1, col: 3 }])

    expect(response.ok, response.error).toBe(true)
    expect(cropCount(response, 'vegetable', 1, 3)).toBe(3)
  })

  it('E071 S6: declining Cow Patty leaves the normal sow count', () => {
    const session = setup({ played: true, grain: 1, fields: [{ row: 1, col: 3 }] })
    let response = sow(session, [{ row: 1, col: 3, crop: 'grain' }])

    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(true)
    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(cropCount(response, 'grain', 1, 3)).toBe(3)
  })

  it('E071 S7: sowing in a field not adjacent to a pasture offers no Cow Patty bonus', () => {
    const session = setup({ played: true, grain: 1, fields: [{ row: 0, col: 4 }] })

    const response = sow(session, [{ row: 0, col: 4, crop: 'grain' }])

    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    expect(cropCount(response, 'grain', 0, 4)).toBe(3)
  })

  it('E071 S8: when only one of two sown fields borders a pasture only that field is eligible', () => {
    const session = setup({
      played: true, grain: 2, fields: [{ row: 1, col: 3 }, { row: 0, col: 4 }],
    })

    let response = acceptCowPatty(session, sow(session, [
      { row: 1, col: 3, crop: 'grain' }, { row: 0, col: 4, crop: 'grain' },
    ]))
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.selection?.selectablePositions
      : undefined).toEqual([{ row: 1, col: 3 }])
    response = select(session, [{ row: 1, col: 3 }])

    expect(response.ok, response.error).toBe(true)
    expect(cropCount(response, 'grain', 1, 3)).toBe(4)
    expect(cropCount(response, 'grain', 0, 4)).toBe(3)
  })

  it('E071 S9: OA rejects selecting both eligible fields because its Cow Patty prompt is capped at one', () => {
    const session = setup({
      played: true, grain: 2, fields: [{ row: 1, col: 1 }, { row: 1, col: 3 }],
    })

    let response = acceptCowPatty(session, sow(session, [
      { row: 1, col: 1, crop: 'grain' }, { row: 1, col: 3, crop: 'grain' },
    ]))
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.selection?.selectablePositions
      : undefined).toEqual([{ row: 1, col: 1 }, { row: 1, col: 3 }])
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.selection?.maxSelections
      : undefined).toBe(1)
    response = select(session, [{ row: 1, col: 1 }, { row: 1, col: 3 }])

    expect(response.ok).toBe(false)
    expect(cropCount(response, 'grain', 1, 1)).toBe(3)
    expect(cropCount(response, 'grain', 1, 3)).toBe(3)
  })

  it('E071 S10: Cow Patty contributes its printed one point at scoring', () => {
    const response = setup({ played: true, pasture: false }).getState()

    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })
})
