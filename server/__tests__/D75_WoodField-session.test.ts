import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D075_WoodField'

const CARD_ID = 'D075_WoodField'
const FILLER = '__test_placeholder__'
const OCCUPATION = 'A100_Curator'
const ROW = -1
const COL_BASE = 4075

type CardFieldStack = { crop: 'wood'; remaining: number } | null

const setup = ({
  played = true, food = 20, wood = 0, stone = 0, occupations = 1, round = 14,
  stacks, normalFields = 0, joinery = false,
}: {
  played?: boolean
  food?: number
  wood?: number
  stone?: number
  occupations?: number
  round?: number
  stacks?: CardFieldStack[]
  normalFields?: number
  joinery?: boolean
} = {}) => {
  const session = new GameSession(6075, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources,
      wood: index === 0 ? wood : 0,
      clay: 0,
      reed: 0,
      stone: index === 0 ? stone : 0,
      food: index === 0 ? food : 20,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    }
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
  if (played) player.minorPlayed = [CARD_ID]
  player.occupationPlayed = occupations > 0 ? [OCCUPATION] : []
  if (stacks !== undefined) {
    player.cardStates[CARD_ID] = { extraData: { cardFieldStacks: stacks } }
  }
  player.fields = Array.from({ length: normalFields }, (_, index) => ({
    row: 0,
    col: index,
    stacks: [],
  }))
  if (joinery) player.improvements = ['Major_Joinery']
  state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy = []
  state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy = []
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinorChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playWoodField = (session: GameSession) => {
  let response = enterMinorChoice(session)
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const cardFieldStacks = (response: SessionResponse) =>
  readCardExtraData<CardFieldStack[]>(response.state.players[0]!, CARD_ID, 'cardFieldStacks')

const enterSow = (session: GameSession) => {
  const response = session.takeAction(0, 'grain-utilization')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.farm.farmType !== 'sow') {
    throw new Error('expected sow interaction')
  }
  return response
}

const sowSlots = (session: GameSession, slots: number[]) => {
  enterSow(session)
  return session.commitSelectionChoice(0, {
    crops: slots.map((slot) => ({ row: ROW, col: COL_BASE + slot, crop: 'wood' as const })),
  })
}

const scoreCategory = (response: SessionResponse, key: string) =>
  response.scores[0]!.categories.find((category) => category.key === key)

describe('D075 Wood Field parity', () => {
  it('D075 S1: one occupation and one food play Wood Field', () => {
    const response = playWoodField(setup({ played: false, food: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D075 S2: without an occupation Wood Field is unavailable and pays nothing', () => {
    const response = enterMinorChoice(setup({ played: false, food: 1, occupations: 0 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('D075 S3: one wood sows one Wood Field slot as a three-wood stack', () => {
    const response = sowSlots(setup({ wood: 1 }), [0])

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(cardFieldStacks(response)).toEqual([{ crop: 'wood', remaining: 3 }, null])
  })

  it('D075 S4: two wood sow both Wood Field slots in one action', () => {
    const response = sowSlots(setup({ wood: 2 }), [0, 1])

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(cardFieldStacks(response)).toEqual([
      { crop: 'wood', remaining: 3 },
      { crop: 'wood', remaining: 3 },
    ])
  })

  it('D075 S5: one wood cannot sow both slots and the rejected request is atomic', () => {
    const session = setup({ wood: 1, stacks: [null, null] })
    enterSow(session)

    const rejected = session.commitSelectionChoice(0, {
      crops: [
        { row: ROW, col: COL_BASE, crop: 'wood' },
        { row: ROW, col: COL_BASE + 1, crop: 'wood' },
      ],
    })

    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('NOT_ENOUGH_SEEDS')
    expect(rejected.state.players[0]!.resources.wood).toBe(1)
    expect(cardFieldStacks(rejected)).toEqual([null, null])

    const retried = session.commitSelectionChoice(0, {
      crops: [{ row: ROW, col: COL_BASE, crop: 'wood' }],
    })
    expect(retried.ok, retried.error).toBe(true)
    expect(retried.state.players[0]!.resources.wood).toBe(0)
    expect(cardFieldStacks(retried)).toEqual([{ crop: 'wood', remaining: 3 }, null])
  })

  it('D075 S6: a non-wood crop is rejected without changing resources or either slot', () => {
    const session = setup({ wood: 1, stone: 1, stacks: [null, null] })
    enterSow(session)

    const response = session.commitSelectionChoice(0, {
      crops: [{ row: ROW, col: COL_BASE, crop: 'stone' }],
    })

    expect(response.ok).toBe(false)
    expect(response.error).toBe('INVALID_CROP')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 1 })
    expect(cardFieldStacks(response)).toEqual([null, null])
  })

  it('D075 S7: a real harvest reaps one wood from each nonempty slot', () => {
    const session = setup({
      round: 4,
      stacks: [{ crop: 'wood', remaining: 3 }, { crop: 'wood', remaining: 3 }],
    })
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(cardFieldStacks(response)).toEqual([
      { crop: 'wood', remaining: 2 },
      { crop: 'wood', remaining: 2 },
    ])
  })

  it('D075 S8: both card slots are excluded from base field scoring', () => {
    const response = setup({ normalFields: 1 }).getState()

    expect(scoreCategory(response, 'fields')).toMatchObject({ quantity: 1, total: -1 })
  })

  it('D075 S9: wood planted on Wood Field does not count toward Joinery bonus scoring', () => {
    const response = setup({
      wood: 3,
      joinery: true,
      stacks: [{ crop: 'wood', remaining: 3 }, { crop: 'wood', remaining: 3 }],
    }).getState()
    const joinery = scoreCategory(response, 'cardBonusVp')?.entries.find((entry) =>
      'cardId' in entry && entry.cardId === 'Major_Joinery')

    expect(joinery).toMatchObject({ score: 1 })
  })
})
