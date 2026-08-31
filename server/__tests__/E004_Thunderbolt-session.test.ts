import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E004_Thunderbolt'
import '../../shared/cards/E/E070_CropRotationField'

const CARD_ID = 'E004_Thunderbolt'
const CROP_ROTATION_FIELD = 'E070_CropRotationField'

const setup = () => {
  const session = new GameSession(404)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((entry, index) => setWorkersAtHome(state, entry, index === 0 ? 2 : 0))
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
    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('does not allow buying with no grain field', () => {
    const session = setup()
    const woodBefore = session.state.players[0]!.resources.wood

    const response = buyThunderbolt(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })

  it('currently ignores an E070 grain field when Thunderbolt is bought', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed.push(CROP_ROTATION_FIELD)
    player.cardStates[CROP_ROTATION_FIELD] = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] },
    }
    player.resources.vegetable = 1
    session.loadState(session.state)
    const woodBefore = player.resources.wood

    const response = buyThunderbolt(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
      .not.toBe('selection')
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.cardStates[CROP_ROTATION_FIELD]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'grain', remaining: 1 },
    ])
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })
})
