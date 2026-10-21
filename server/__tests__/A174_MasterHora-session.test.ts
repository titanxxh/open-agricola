import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'

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
  if (resp.interaction.request.kind !== 'choice') return undefined
  return resp.interaction.request.options?.find((option) =>
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

  it('still offers the option if paying food would fail the space precheck', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 1
    player.occupationHand = ['A123_FrameBuilder']
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons-56-variable')

    expect(resp.ok).toBe(true)
    const accept = findA174Option(resp)
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected blocked')
    expect(resp.interaction.request.kind).toBe('engine-blocked')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.occupationPlayed).not.toContain('A123_FrameBuilder')
    const undone = session.undoAction(0)
    expect(undone.state.players[0]!.resources).toMatchObject({ food: 1, vegetable: 0 })
  })

  it('offers the vegetable purchase before resolving an extra place-farmer target on an extension space', () => {
    const session = setup()
    const grant = 'TEST_EXTRA_PLACEMENT'
    const state = session.getState().state
    state.players[0]!.minorPlayed.push(grant)
    session.loadState(state)
    session.withCtx(() => requireActiveCardRegistry('A174-extra-placement').registerListener({
      id: grant, cardIds: [grant], actions: ['anytime'], phases: ['anytime'],
      handler: () => ({ sourceCard: grant, flow: {
        type: 'leaf', actionId: 'place-farmer', sourceCard: grant,
        actionContext: { constraints: ['copse-56'] },
      } }),
    }))
    let response = session.takeAnytimeAction(0, grant)
    expect(response.ok, response.error).toBe(true)
    if (!findA174Option(response)) response = session.resolveChoice(0, 'copse-56')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, vegetable: 0, wood: 0 })
    expect(response.state.actionSpaces.find(space => space.id === 'copse-56')!.resources.wood).toBe(1)
    const purchase = findA174Option(response)
    expect(purchase).toBeDefined()
    response = session.resolveChoice(0, purchase!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, vegetable: 1, wood: 1 })
    expect(response.state.actionSpaces.find(space => space.id === 'copse-56')!.takenBy).toHaveLength(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.resourceStats).toMatchObject({ used: 1 })
  })

  it('allows the before attempt and restores an unavailable host through explicit undo', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 1
    session.loadState(state)
    const houseBuilding = session.getState().state.actionSpaces.find((space) => space.id === 'house-building-56')
    if (!houseBuilding) throw new Error('missing house-building-56')
    houseBuilding.canBeExecutedByPlayer = () => true

    let resp = session.takeAction(0, 'house-building-56')
    expect(resp.ok).toBe(true)
    resp = session.resolveChoice(0, findA174Option(resp)!.value)
    expect(resp.interaction.request.kind).toBe('engine-blocked')
    resp = session.undoAction(0)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(resp.state.players[0]!.resources.vegetable).toBe(0)
    expect(resp.state.actionSpaces.find((space) => space.id === 'house-building-56')?.takenBy).toHaveLength(0)
  })
})
