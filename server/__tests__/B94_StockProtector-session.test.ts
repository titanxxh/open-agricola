import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/B/B094_StockProtector'

const CARD_ID = 'B094_StockProtector'

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

describe('B094_StockProtector session', () => {
  it('B094 S1: playing Stock Protector through Lessons keeps the occupation in play', () => {
    const session = new GameSession(94, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID]
    player.occupationPlayed = []
    session.loadState(state)

    const response = session.takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B094 S2-S3: Fencing grants two wood and can place another person', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources = {
      ...player.resources,
      wood: 6,
    }

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(8)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionFenceSelect')

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionStockProtectorPlace')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)

    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.some((option) => option.value === 'day-laborer')).toBe(true)

    resp = session.resolveChoice(0, 'day-laborer')

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.actionSpaces.find((space) => space.id === 'fencing')!.takenBy).toHaveLength(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy).toHaveLength(1)
  })

  it('B094 S5: blocks after gaining wood if fencing is still not doable, then explicitly undoes', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources = { ...player.resources, wood: 0 }

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).toBe('engine-blocked')
    expect(resp.state.players[0]!.resources.wood).toBe(2)
    resp = session.undoAction(0)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.actionSpaces.find((space) => space.id === 'fencing')?.takenBy).toHaveLength(0)
  })

  it('B094 S4: declining the post-Fencing option places no second person', () => {
    const session = new GameSession(94, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 6
    session.loadState(state)

    let response = session.takeAction(0, 'fencing')
    response = session.commitSelectionChoice(0, { edges: edgesForTile(1, 1), extraWood: 0 })
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    expect(response.interaction.stateId).toBe('wait')

    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'fencing')!.takenBy).toHaveLength(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy).toHaveLength(0)
  })
})
