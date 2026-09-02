import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption, Field } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A079_GardenHoe'
import '../../shared/cards/B/B068_Beanfield'
import '../../shared/cards/B/B113_PatchCaregiver'
import '../../shared/cards/B/B115_TinsmithMaster'
import '../../shared/cards/D/D058_Gritter'

const CARD_FIELD = 'B113_PatchCaregiver'
const BEAN_FIELD = 'B068_Beanfield'

const setup = (options: {
  minorPlayed?: string[]
  occupationPlayed?: string[]
  fields?: Field[]
  grain?: number
  vegetable?: number
  cardFields?: Record<string, Array<{ crop: 'grain' | 'vegetable'; remaining: number } | null>>
} = {}) => {
  const session = new GameSession(800)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'
  state.players.forEach((player, index) => setWorkersAtHome(state, player, index === 0 ? 2 : 0))
  const player = state.players[0]!
  player.fields = options.fields ?? []
  player.minorPlayed = options.minorPlayed ?? []
  player.occupationPlayed = options.occupationPlayed ?? [CARD_FIELD]
  player.resources.grain = options.grain ?? 0
  player.resources.vegetable = options.vegetable ?? 0
  for (const [cardId, slots] of Object.entries(options.cardFields ?? { [CARD_FIELD]: [null] })) {
    player.cardStates[cardId] = { extraData: { cardFieldStacks: slots } }
  }
  session.loadState(state)
  return session
}

const sow = (
  session: GameSession,
  crop: 'grain' | 'vegetable',
  col = 2113,
): SessionResponse => {
  const response = session.takeAction(0, 'grain-utilization')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.kind).toBe('farm-select')
  return session.commitSelectionChoice(0, { crops: [{ row: -1, col, crop }] })
}

describe('Logical Field sow session', () => {
  it('keeps Sow available when the only target is a Card Field', () => {
    const session = setup({ grain: 1 })
    const eventCount = session.state.events.length

    const response = sow(session, 'grain')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_FIELD]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'grain', remaining: 3 },
    ])
    expect(response.state.events.slice(eventCount)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.sown',
        sows: [{
          location: { kind: 'field', playerId: response.state.players[0]!.id, row: -1, col: 2113 },
          crop: 'grain',
          added: 3,
        }],
      }),
    ]))
  })

  it('A079 reacts to vegetable sown on a Card Field', () => {
    const session = setup({ minorPlayed: ['A079_GardenHoe'], vegetable: 1 })

    const response = sow(session, 'vegetable')

    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(response.state.players[0]!.resources.stone).toBe(1)
  })

  it('A079 ignores grain sown while an unrelated vegetable field exists', () => {
    const session = setup({
      minorPlayed: ['A079_GardenHoe'],
      grain: 1,
      fields: [{ row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] }],
    })

    const response = sow(session, 'grain')

    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[0]!.resources.stone).toBe(0)
  })

  it('D058 counts every vegetable Logical Field after sowing vegetable', () => {
    const session = setup({
      minorPlayed: ['D058_Gritter', BEAN_FIELD],
      occupationPlayed: [CARD_FIELD],
      vegetable: 1,
      fields: [{ row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] }],
      cardFields: {
        [CARD_FIELD]: [null],
        [BEAN_FIELD]: [{ crop: 'vegetable', remaining: 2 }],
      },
    })
    const foodBefore = session.state.players[0]!.resources.food

    const response = sow(session, 'vegetable')

    expect(response.state.players[0]!.resources.food).toBe(foodBefore + 3)
  })

  it('D058 ignores grain sown while vegetable fields already exist', () => {
    const session = setup({
      minorPlayed: ['D058_Gritter'],
      grain: 1,
      fields: [{ row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] }],
    })
    const foodBefore = session.state.players[0]!.resources.food

    const response = sow(session, 'grain')

    expect(response.state.players[0]!.resources.food).toBe(foodBefore)
  })

  it('B115 offers and grows the freshly sown Card Field with current metadata', () => {
    const session = setup({ occupationPlayed: [CARD_FIELD, 'B115_TinsmithMaster'], grain: 1 })

    let response = sow(session, 'grain')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const accept = response.interaction.request.options?.find(
      (option: ActionChoiceOption) => option.value !== '__skip__',
    )
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.selection?.selectablePositions
      : []).toEqual([{
      row: -1,
      col: 2113,
      sourceCard: CARD_FIELD,
      groupKey: CARD_FIELD,
      cardFieldSlot: 0,
    }])
    response = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 2113 }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_FIELD]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'grain', remaining: 4 },
    ])
  })

  it('rejects sowing one grain into a Farmyard Field and a Card Field atomically', () => {
    const session = setup({
      grain: 1,
      fields: [{ row: 0, col: 0, stacks: [] }],
    })

    const started = session.takeAction(0, 'grain-utilization')
    expect(started.ok, started.error).toBe(true)
    const response = session.commitSelectionChoice(0, {
      crops: [
        { row: 0, col: 0, crop: 'grain' },
        { row: -1, col: 2113, crop: 'grain' },
      ],
    })

    expect(response.ok).toBe(false)
    expect(response.error).toBe('NOT_ENOUGH_SEEDS')
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([])
    expect(response.state.players[0]!.cardStates[CARD_FIELD]?.extraData?.cardFieldStacks).toEqual([null])
  })
})
