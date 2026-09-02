import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E004_Thunderbolt'
import '../../shared/cards/E/E070_CropRotationField'

const CARD_ID = 'E004_Thunderbolt'
const CROP_ROTATION_FIELD = 'E070_CropRotationField'
const FIXED_HANDS = [
  { occupation: '__test_occupation_p1__', minor: CARD_ID },
  { occupation: '__test_occupation_p2__', minor: '__test_minor_p2__' },
  { occupation: '__test_occupation_p3__', minor: '__test_minor_p3__' },
  { occupation: '__test_occupation_p4__', minor: '__test_minor_p4__' },
]

const setup = () => {
  const session = new GameSession(404, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((entry, index) => {
    entry.occupationHand = [FIXED_HANDS[index]!.occupation]
    entry.minorHand = [FIXED_HANDS[index]!.minor]
    setWorkersAtHome(state, entry, index === 0 ? 2 : 0)
  })
  state.players[0]!.minorHand = [CARD_ID]
  session.loadState(state)
  return session
}

const buyThunderbolt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 6; step += 1) {
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
    if (card) {
      response = session.resolveChoice(0, card.value)
      continue
    }
    const improvement = response.interaction.request.options?.find(
      (option) => option.value.startsWith('action-improvement-'),
    )
    if (improvement) {
      response = session.resolveChoice(0, improvement.value)
      continue
    }
    const proceed = response.interaction.request.options?.find((option) => option.value.startsWith('flow-'))
    if (!proceed) return response
    response = session.resolveChoice(0, proceed.value)
  }
  return response
}

const enterSelection = (session: GameSession, response: SessionResponse) => {
  let current = response
  for (let step = 0; step < 4; step += 1) {
    if (current.interaction.stateId !== 'wait') return current
    if (current.interaction.request.kind === 'selection') return current
    const proceed = current.interaction.request.options?.find((option) => option.value.startsWith('flow-'))
    if (!proceed) return current
    current = session.resolveChoice(0, proceed.value)
  }
  return current
}

describe('E004 Thunderbolt native session', () => {
  it('removes all grain from exactly one selected field and gains 2 wood per grain', () => {
    const session = setup()
    session.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 1, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]
    session.loadState(session.state)
    const woodBefore = session.state.players[0]!.resources.wood

    let response = enterSelection(session, buyThunderbolt(session))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.kind).toBe('selection')
    const eventCount = response.state.events.length
    const logCount = response.state.log.length
    const scoresBefore = structuredClone(response.scores)

    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })

    expect(response.ok, response.error).toBe(true)
    const player = response.state.players[0]!
    expect(player.resources.wood).toBe(woodBefore + 6)
    expect(player.fields.find((field) => field.row === 0 && field.col === 2)?.stacks).toEqual([])
    expect(player.fields.find((field) => field.row === 0 && field.col === 3)?.stacks).toEqual([
      { kind: 'vegetable', remaining: 2 },
    ])
    expect(player.fields.find((field) => field.row === 1 && field.col === 2)?.stacks).toEqual([
      { kind: 'grain', remaining: 1 },
    ])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.events.slice(eventCount)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.cropRemoved',
        sourceCardId: CARD_ID,
        reason: 'cardEffect',
        crops: [{
          location: { kind: 'field', playerId: player.id, row: 0, col: 2 },
          crop: 'grain',
          amount: 3,
        }],
      }),
    ]))
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.farmCropRemoved',
        params: expect.objectContaining({ player: 'PlayerA', crops: { grain: 3 } }),
      }),
    ]))
    expect(response.state.log.length).toBeGreaterThan(logCount)
    expect(response.scores.map((score) => score.playerId)).toEqual(scoresBefore.map((score) => score.playerId))
  })

  it('allows declining without changing any grain field', () => {
    const session = setup()
    session.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
    ]
    session.loadState(session.state)
    const woodBefore = session.state.players[0]!.resources.wood

    let response = buyThunderbolt(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
    const eventCount = response.state.events.length
    const scoresBefore = structuredClone(response.scores)
    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.events.slice(eventCount).some((event) => event.type === 'farm.cropRemoved')).toBe(false)
    expect(response.state.log.some((entry) => entry.key === 'log.farmCropRemoved')).toBe(false)
    expect(response.scores).toEqual(scoresBefore)
  })

  it('does not allow buying with no grain field', () => {
    const session = setup()
    const woodBefore = session.state.players[0]!.resources.wood
    const scoresBefore = structuredClone(session.getState().scores)

    const response = buyThunderbolt(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
      .not.toBe('selection')
    expect(response.state.events.some((event) => event.type === 'farm.cropRemoved')).toBe(false)
    expect(response.state.log.some((entry) => entry.key === 'log.farmCropRemoved')).toBe(false)
    expect(response.scores).toEqual(scoresBefore)
  })

  it('removes E070 grain and offers its opposite-crop sow', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed.push(CROP_ROTATION_FIELD)
    player.cardStates[CROP_ROTATION_FIELD] = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] },
    }
    player.fields = [{ row: 0, col: 2, stacks: [] }]
    player.resources.vegetable = 1
    session.loadState(session.state)
    const woodBefore = player.resources.wood
    const scoresBefore = structuredClone(session.getState().scores)

    let response = enterSelection(session, buyThunderbolt(session))

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.kind).toBe('selection')
    expect(response.interaction.request.selection?.selectablePositions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: -1, col: 5070, sourceCard: CROP_ROTATION_FIELD }),
      ]),
    )
    const eventCount = response.state.events.length
    const logCount = response.state.log.length

    response = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 5070 }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore + 4)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.cardStates[CROP_ROTATION_FIELD]?.extraData?.cardFieldStacks).toEqual([null])
    expect(response.scores).toEqual(scoresBefore)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.promptKey).toBe('ui.interactionOptionalAction')
    const sowOption = response.interaction.request.options?.find(
      (option) => option.value !== '__skip__' && option.sourceCard === CROP_ROTATION_FIELD,
    )
    expect(sowOption).toBeDefined()

    response = session.resolveChoice(0, sowOption!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[0]!.cardStates[CROP_ROTATION_FIELD]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'vegetable', remaining: 2 },
    ])
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.events.slice(eventCount)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.cropRemoved',
        sourceCardId: CARD_ID,
        reason: 'cardEffect',
        crops: [{
          location: { kind: 'card', playerId: player.id, cardId: CROP_ROTATION_FIELD },
          crop: 'grain',
          amount: 2,
        }],
      }),
      expect.objectContaining({
        type: 'farm.sown',
        sourceCardId: CROP_ROTATION_FIELD,
        sows: [{
          location: { kind: 'field', playerId: player.id, row: -1, col: 5070 },
          crop: 'vegetable',
          added: 2,
        }],
      }),
    ]))
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.farmCropRemoved',
        params: expect.objectContaining({ player: 'PlayerA', crops: { grain: 2 } }),
      }),
      expect.objectContaining({ key: 'log.sow', params: { player: 'PlayerA' } }),
    ]))
    expect(response.state.log.length).toBeGreaterThan(logCount)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      expect(response.interaction.request.kind).toBe('confirm-next-player')
    }
    expect(response.scores.map((score) => score.playerId)).toEqual(scoresBefore.map((score) => score.playerId))
    expect(response.scores[0]!.categories.find((category) => category.key === 'vegetables')?.quantity).toBe(0)
    expect(response.scores[0]!.total).toBe(scoresBefore[0]!.total - 2)
  })

  it('completes E070 removal without a sow interaction when vegetable is unavailable', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed.push(CROP_ROTATION_FIELD)
    player.cardStates[CROP_ROTATION_FIELD] = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] },
    }
    player.resources.vegetable = 0
    session.loadState(session.state)
    const woodBefore = player.resources.wood
    const scoresBefore = structuredClone(session.getState().scores)

    let response = enterSelection(session, buyThunderbolt(session))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const eventCount = response.state.events.length
    const logCount = response.state.log.length

    response = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 5070 }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore + 2)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[0]!.cardStates[CROP_ROTATION_FIELD]?.extraData?.cardFieldStacks).toEqual([null])
    expect(response.state.events.slice(eventCount)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'farm.cropRemoved', reason: 'cardEffect' }),
    ]))
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.farmCropRemoved',
        params: expect.objectContaining({ player: 'PlayerA', crops: { grain: 1 } }),
      }),
    ]))
    expect(response.state.log.length).toBeGreaterThan(logCount)
    expect(response.state.events.slice(eventCount).some((event) => event.type === 'farm.sown')).toBe(false)
    expect(response.state.log.some((entry) => entry.key === 'log.sow')).toBe(false)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      expect(response.interaction.request.kind).toBe('confirm-next-player')
      expect(response.interaction.sourceCard).not.toBe(CROP_ROTATION_FIELD)
    }
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.scores).toEqual(scoresBefore)
  })
})
