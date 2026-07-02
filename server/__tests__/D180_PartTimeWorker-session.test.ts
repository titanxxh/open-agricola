import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { ActionChoiceOption, Resource } from '../../shared/contract/types'
import '../../shared/cards/D/D180_PartTimeWorker'
import '../../shared/cards/A/A108_MushroomCollector'
import '../../shared/cards/A/A056_Basket'
import '../../shared/cards/A/A171_Sidekick'

const CARD_ID = 'D180_PartTimeWorker'
const MINOR_CARDS = new Set(['A056_Basket'])

const setup = (cards: string[], forestResources: Partial<Resource>) => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  player.occupationPlayed = cards.filter((cardId) => !MINOR_CARDS.has(cardId))
  player.minorPlayed = cards.filter((cardId) => MINOR_CARDS.has(cardId))
  player.resources.wood = 0
  player.resources.food = 0
  player.resources.sheep = 0
  player.resources.boar = 0
  player.resources.cattle = 0
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources = { ...forest.resources, ...forestResources }
  session.loadState(state)
  return session
}

const optionFrom = (resp: ReturnType<GameSession['getState']>, sourceCard: string) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return undefined
  return resp.interaction.options?.find((option: ActionChoiceOption) =>
    option.sourceCard === sourceCard && option.value !== '__skip__',
  )
}

const chooseFrom = (session: GameSession, resp: ReturnType<GameSession['getState']>, sourceCard: string) => {
  const wasTriggerSelect = resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'select-trigger'
  const option = optionFrom(resp, sourceCard)
  expect(option).toBeDefined()
  let next = session.resolveChoice(0, option!.value)
  if (!wasTriggerSelect) return next
  const nested = optionFrom(next, sourceCard)
  if (!nested) return next
  next = session.resolveChoice(0, nested.value)
  return next
}

describe('D180 Part-Time Worker session', () => {
  it('accepts exact two goods by returning one good and gaining a sheep', () => {
    const session = setup([CARD_ID], { wood: 2 })

    let resp = session.takeAction(0, 'forest')
    resp = chooseFrom(session, resp, CARD_ID)

    const player = resp.state.players[0]!
    const forest = resp.state.actionSpaces.find((space) => space.id === 'forest')!
    expect(player.resources).toMatchObject({ wood: 1, sheep: 1 })
    expect(forest.resources.wood).toBe(1)
  })

  it('declines without returning goods or gaining an animal', () => {
    const session = setup([CARD_ID], { wood: 2 })

    let resp = session.takeAction(0, 'forest')
    expect(optionFrom(resp, CARD_ID)).toBeDefined()
    resp = session.resolveChoice(0, '__skip__')

    const player = resp.state.players[0]!
    const forest = resp.state.actionSpaces.find((space) => space.id === 'forest')!
    expect(player.resources).toMatchObject({ wood: 2, sheep: 0, boar: 0, cattle: 0 })
    expect(forest.resources.wood).toBe(0)
  })

  it('does not trigger for non-matching totals', () => {
    const session = setup([CARD_ID], { wood: 3 })

    const resp = session.takeAction(0, 'forest')

    expect(optionFrom(resp, CARD_ID)).toBeUndefined()
    expect(resp.state.players[0]!.resources.wood).toBe(3)
  })

  it('coexists with two other return-to-space optional cards in the same collect sequence', () => {
    const session = setup(['A108_MushroomCollector', 'A056_Basket', CARD_ID], { wood: 6 })

    let resp = session.takeAction(0, 'forest')
    resp = chooseFrom(session, resp, 'A108_MushroomCollector')
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 5, food: 2 })
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(1)

    resp = chooseFrom(session, resp, 'A056_Basket')
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 3, food: 5 })
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(3)

    resp = chooseFrom(session, resp, CARD_ID)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 0, cattle: 1 })
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(6)
  })

  it('returns goods to the collected target space when a card placement collects a different space', () => {
    const session = new GameSession(42, undefined, { playerCount: 5 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 3
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'western-quarry'
    state.roundActionOrder[1] = 'eastern-quarry'
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    const player = state.players[0]!
    player.occupationPlayed = ['A171_Sidekick', CARD_ID]
    player.resources.food = 2
    player.resources.stone = 0
    player.resources.sheep = 0
    const western = state.actionSpaces.find((space) => space.id === 'western-quarry')!
    const eastern = state.actionSpaces.find((space) => space.id === 'eastern-quarry')!
    western.resources.stone = 2
    eastern.resources.stone = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'eastern-quarry')
    resp = chooseFrom(session, resp, 'A171_Sidekick')
    resp = chooseFrom(session, resp, CARD_ID)

    expect(resp.state.players[0]!.resources).toMatchObject({ stone: 2, sheep: 1 })
    expect(resp.state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone).toBe(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'eastern-quarry')!.resources.stone).toBe(0)
  })
})
