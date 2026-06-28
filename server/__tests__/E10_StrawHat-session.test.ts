import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { hasPendingExtraTurn } from '../../shared/cards/card-effects'
import {
  markAllWorkersUsed,
  newbornCount,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../../shared/domain/player'

import '../../shared/cards/E/E010_StrawHat'
import '../../shared/cards/A/A092_AdoptiveParents'

const CARD_ID = 'E010_StrawHat'
const A092_ID = 'A092_AdoptiveParents'

const requestKind = (resp: ReturnType<GameSession['takeAction']>): string =>
  resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : 'idle'

const placeableSpaces = (session: GameSession) =>
  session
    .getState()
    .state.actionSpaces.filter((space) =>
      space.id !== '__test-worker-sink__' &&
      (!space.takenBy || space.takenBy.length === 0) &&
      (space.roundAvailable ?? 1) <= session.getState().state.round,
    )
    .map((space) => space.id)

const setupRoundEnd = () => {
  const session = new GameSession(undefined, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundPhase = 'work'

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.occupationHand = ['A116_WoodCutter']
  player.resources.food = 5
  player.minorHand = ['__test_placeholder__']

  const opponent = state.players[1]!
  opponent.minorHand = ['__test_placeholder__']
  opponent.occupationHand = ['__test_placeholder__']

  const farmland = state.actionSpaces.find((space) => space.id === 'farmland')!
  farmland.takenBy = [{ playerId: player.id, workerId: '1' }]
  markAllWorkersUsed(state, player)
  markAllWorkersUsed(state, opponent)

  session.loadState(state)
  return session
}

describe('E010_StrawHat session', () => {
  it('choosing food gains exactly 1 food', () => {
    const session = setupRoundEnd()
    const beforeFood = session.getState().state.players[0]!.resources.food

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected StrawHat choice')
    expect(resp.interaction.options?.some(option => option.value === '__skip__')).toBe(false)

    resp = session.resolveChoice(0, resp.interaction.options![0]!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(beforeFood + 1)
  })

  it('choosing move clears Farmland and resolves the target action flow', () => {
    const session = setupRoundEnd()

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected StrawHat choice')

    resp = session.resolveChoice(0, resp.interaction.options![1]!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected move target choice')

    const lessonsOption = resp.interaction.options?.find(option => option.value === 'lessons')
    expect(lessonsOption).toBeDefined()
    resp = session.resolveChoice(0, lessonsOption!.value)

    const farmland = resp.state.actionSpaces.find((space) => space.id === 'farmland')!
    expect(farmland.takenBy).toEqual([])
    expect(resp.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(resp.interaction.stateId).toBe('idle')
  })

  it('moving an A92 extra-turn worker does not lose or duplicate the A92 opportunity', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 1
    state.round = 3
    state.roundPhase = 'work'

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationPlayed.push(A092_ID)
    player.resources.food = 5
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['A116_WoodCutter']
    setActiveWorkerCount(player, 1)
    setWorkersAtHome(state, player, 0)
    const newborn = player.workers.find((worker) => worker.isActive)!
    newborn.isNewborn = true
    state.actionSpaces.find((space) => space.id === 'forest')!.takenBy = [
      { playerId: player.id, workerId: newborn.id },
    ]

    const opponent = state.players[1]!
    opponent.minorHand = ['__test_placeholder__']
    opponent.occupationHand = ['__test_placeholder__']
    setActiveWorkerCount(opponent, 1)
    setWorkersAtHome(state, opponent, 1)

    session.loadState(state)

    let resp = session.takeAction(
      1,
      placeableSpaces(session).find((id) => id !== 'farmland' && id !== 'lessons')!,
    )
    while (requestKind(resp) === 'confirm-next-player') {
      if (resp.interaction.stateId !== 'wait') throw new Error('expected confirm-next-player')
      resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm')
    }

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionFlowSelect')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected A92 choice')
    expect(hasPendingExtraTurn(resp.state, resp.state.players[0]!)).toBe(true)

    resp = session.resolveChoice(0, resp.interaction.options![0]!.value)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionPlaceFarmerExtra')
    expect(newbornCount(resp.state.players[0]!)).toBe(0)
    expect(hasPendingExtraTurn(resp.state, resp.state.players[0]!)).toBe(false)

    resp = session.resolveChoice(0, 'farmland')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionPlowSelect')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected plow selection')
    const tile = resp.interaction.farm.selectableTiles[0]
    expect(tile).toBeDefined()

    resp = session.commitSelectionChoice(0, { tile })
    expect(requestKind(resp)).toBe('confirm-next-player')

    if (resp.interaction.stateId !== 'wait') throw new Error('expected confirm-next-player')
    resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionFlowSelect')
    expect(resp.interaction.stateId === 'wait'
      ? resp.interaction.options?.map((option) => option.sourceCard)
      : []).toEqual([CARD_ID, CARD_ID])

    if (resp.interaction.stateId !== 'wait') throw new Error('expected E10 choice')
    const move = resp.interaction.options!.find((option) => option.labelKey === 'actions.move-farmer-to-space.name')!
    resp = session.resolveChoice(0, move.value)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionMoveFarmerToSpace')

    resp = session.resolveChoice(0, 'lessons')

    expect(resp.state.round).toBe(4)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(resp.state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy).toEqual([])
    expect(hasPendingExtraTurn(resp.state, resp.state.players[0]!)).toBe(false)
    expect(newbornCount(resp.state.players[0]!)).toBe(0)
  })
})
