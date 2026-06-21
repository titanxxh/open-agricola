import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { placeFarmerAction } from '../../shared/actions/effects/place-farmer'
import type { ActionExecutionContext } from '../../shared/contract/types'

const CARD_ID = 'A174_MasterHora'

const setup = () => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.resources.food = 2
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  state.players[0]!.occupationPlayed = [CARD_ID]
  session.loadState(state)
  return session
}

const findA174Option = (resp: ReturnType<GameSession['takeAction']>) => {
  if (resp.interaction.stateId !== 'wait') return undefined
  return resp.interaction.options?.find((option) =>
    JSON.stringify(option.effectPreview).includes('"vegetable":1'),
  )
}

describe('A174 Master Hora', () => {
  it('offers a vegetable purchase before the owner uses a linked 5/6 extension space', () => {
    const session = setup()

    let resp = session.takeAction(0, 'copse-56')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected A174 choice')
    const accept = findA174Option(resp)
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)

    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
  })

  it('does not trigger for the owner without food', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const resp = session.takeAction(0, 'copse-56')

    expect(resp.ok).toBe(true)
    expect(findA174Option(resp)).toBeUndefined()
    expect(resp.state.players[0]!.resources.vegetable).toBe(0)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
  })

  it('does not trigger for another player using an extension space', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)

    const resp = session.takeAction(1, 'copse-56')

    expect(resp.ok).toBe(true)
    expect(findA174Option(resp)).toBeUndefined()
    expect(resp.state.players[1]!.resources.vegetable).toBe(0)
    expect(resp.state.players[1]!.resources.wood).toBe(1)
  })

  it('does not offer the option if paying food would make the host action impossible', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 1
    player.occupationHand = ['A123_FrameBuilder']
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons-56-variable')

    expect(resp.ok).toBe(true)
    expect(findA174Option(resp)).toBeUndefined()
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.vegetable).toBe(0)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
  })

  it('offers the vegetable purchase before resolving an extra place-farmer target on an extension space', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const host = state.actionSpaces.find((space) => space.id === 'day-laborer')!

    const result = placeFarmerAction.resolveChoice!({
      state,
      player,
      space: host,
      sourceCard: 'TEST_EXTRA_PLACEMENT',
      actionContext: { constraints: ['copse-56'] },
    } as unknown as ActionExecutionContext, 'copse-56')

    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(result.flow).toMatchObject({
      type: 'seq',
      children: [
        {
          type: 'seq',
          children: [
            { actionId: 'pay', params: { food: 1 }, sourceCard: CARD_ID },
            { actionId: 'gain', params: { vegetable: 1 }, sourceCard: CARD_ID },
          ],
        },
        { actionId: 'copse-56', expandFlow: true },
      ],
    })
  })

  it('enters engine-blocked if the host action becomes impossible after the before flow', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 1
    session.loadState(state)
    const houseBuilding = session.getState().state.actionSpaces.find((space) => space.id === 'house-building-56')
    if (!houseBuilding) throw new Error('missing house-building-56')
    houseBuilding.canBeExecutedByPlayer = () => true

    let resp = session.takeAction(0, 'house-building-56')

    const accept = findA174Option(resp)
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected engine-blocked')
    expect(resp.interaction.request.kind).toBe('engine-blocked')
    expect(resp.interaction.options).toEqual([])
    expect(resp.interaction.allowedCommands).toEqual(['undoStep', 'undoAction'])
  })
})
