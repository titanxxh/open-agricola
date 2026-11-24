import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState, InteractionState } from '../../shared/contract/types'
import type { CardImpl } from '../../shared/cards/registry'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { createWorkSession } from './_helpers/session-fixtures'
import { orderReactionsManually } from './_helpers/trigger-select'
import { testCardImpl } from './_helpers/test-card-impl'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

// #2039 PR4+5: "at the end of each round" / "at the end of round N" → onRoundEnd;
// "after each round" → onAfterRoundEnd. Both are frozen-order reaction windows.
const CREDIT = 'A054_Credit'
const SCULPTURE = 'B053_SculptureCourse'
const CARROT_MUSEUM = 'D079_CarrotMuseum'
const LIFTING_MACHINE = 'A070_LiftingMachine'
const PIG_BREEDER = 'A165_PigBreeder'
const PURE_BREEDER = 'D167_PureBreeder'
const AFTER_ROUND_FOOD = 'TEST_AfterRoundEndFood'
const ROUND_END_FOOD = 'TEST_RoundEndFood'
const testCards: Record<string, CardImpl> = {
  [AFTER_ROUND_FOOD]: testCardImpl(AFTER_ROUND_FOOD, '{ effect: { id: CARD_ID, onAfterRoundEnd: () => gainLeaf(CARD_ID, { food: 1 }) } }'),
  [ROUND_END_FOOD]: testCardImpl(ROUND_END_FOOD, '{ effect: { id: CARD_ID, onRoundEnd: () => gainLeaf(CARD_ID, { food: 1 }) } }'),
}

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const roundEnd = (round: number, configure: (state: GameState) => void, cardImpls?: Record<string, CardImpl>) => {
  const session = createWorkSession({ seed: 2039, cardImpls, configure: state => {
    state.round = round
    for (const player of state.players) {
      player.fields = []
      Object.assign(player.resources, { food: 10, grain: 0, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0 })
    }
    configure(state)
    for (const player of state.players) markAllWorkersUsed(state, player)
  } })
  sessions.push(session)
  return session
}
const startPlayer = (state: GameState, seat: number) => state.players.forEach((player, index) => { player.startPlayer = index === seat })
const sheepPasture = (state: GameState, seat: number, animal: 'sheep' | 'boar' = 'sheep') => {
  const player = state.players[seat]!
  player.pastures = [{ id: 'pasture', tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }], animalType: animal, animalCount: 2 }]
  player.fenceSegments = ['H-0-3', 'H-0-4', 'H-1-3', 'H-1-4', 'V-0-3', 'V-0-5'].map(edge => ({ edge, type: 'fence' as const }))
  player.resources[animal] = 2
}

type Wait = Extract<InteractionState, { stateId: 'wait' }>
const waiting = (response: SessionResponse): Wait => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error(`expected a waiting interaction, got ${response.interaction.stateId}`)
  return response.interaction
}
const values = (response: SessionResponse) => waiting(response).request.options?.map(option => option.value) ?? []
const passDisabled = (response: SessionResponse) =>
  waiting(response).request.options?.find(option => option.value === '__pass__')?.disabled === true
const windowOf = (response: SessionResponse) => waiting(response).spaceId
const choose = (session: GameSession, response: SessionResponse, value: string) => {
  const interaction = waiting(response)
  expect(values(response), JSON.stringify(interaction)).toContain(value)
  const next = session.resolveChoice(interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
const creditChoice = (session: GameSession, response: SessionResponse, pay: boolean) => {
  expect(waiting(response).sourceCard).toBe(CREDIT)
  const option = waiting(response).request.options?.find(entry => pay
    ? entry.labelKey === 'actions.pay.name'
    : entry.effectPreview?.kind === 'resourceExchange' && entry.effectPreview.resourcesGained?.begging === 1)
  expect(option, JSON.stringify(waiting(response).request.options)).toBeDefined()
  expect(option!.disabled).not.toBe(true)
  return choose(session, response, option!.value)
}
/** Declines optional windows and confirms hand-offs until the next round's work phase. */
const toNextRound = (session: GameSession, response: SessionResponse, round: number) => {
  for (let step = 0; step < 40 && !(response.state.round === round + 1 && response.interaction.stateId === 'idle'); step += 1) {
    const interaction = waiting(response)
    const kind = interaction.request.kind
    if (kind === 'confirm-next-player') response = confirmNextPlayer(session)
    else if (kind === 'confirm-player-switch') response = confirmPlayerSwitch(session)
    else if (kind === 'feed') response = session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] })
    else if (kind === 'animal-reorg') response = session.resolveChoice(interaction.playerIndex, 'confirm', { zones: interaction.request.zones })
    else response = session.resolveChoice(interaction.playerIndex, kind === 'select-trigger' ? '__pass__' : '__skip__')
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.state.round).toBe(round + 1)
  return response
}
const triggered = (response: SessionResponse, cards: string[], round: number) => response.state.events
  .filter(event => event.type === 'card.triggered' && cards.includes(event.sourceCardId ?? '') && event.round === round)
  .map(event => event.sourceCardId)
  .filter((cardId, index, list) => list.indexOf(cardId) === index)

describe('the round-end window orders "at the end of each round" cards', () => {
  const creditAndSculpture = (round: number, manual: boolean) => roundEnd(round, state => {
    const owner = state.players[0]!
    owner.minorPlayed = [CREDIT, SCULPTURE]
    Object.assign(owner.resources, { food: 0, wood: 1 })
    if (manual) orderReactionsManually(state)
  })

  it.each([false, true])('Credit and Sculpture Course share one selector, Pass disabled (manual order: %s)', (manual) => {
    const response = creditAndSculpture(2, manual).performRoundEnd()
    expect(windowOf(response)).toBe('__stage:onRoundEnd')
    expect(response.state.roundPhase).toBe('preparation')
    expect(values(response)).toEqual([CREDIT, SCULPTURE, '__pass__'])
    expect(passDisabled(response)).toBe(true)
  })

  it('Sculpture Course first turns the wood into food that pays the Credit', () => {
    const session = creditAndSculpture(2, false)
    // Only the wood exchange is affordable, so choosing the card runs it.
    let response = choose(session, session.performRoundEnd(), SCULPTURE)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 2 })
    // Credit, now the sole mandatory source, asks its own pay-or-beg choice.
    response = creditChoice(session, response, true)
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 1, begging: 0 })
    expect(response.state.players[0]!.cardStates[CREDIT]?.extraData?.debtDue).toBeUndefined()
    expect(triggered(response, [CREDIT, SCULPTURE], 2)).toEqual([SCULPTURE, CREDIT])
  })

  it('Credit first cannot be paid and takes a begging marker; Sculpture Course follows', () => {
    const session = creditAndSculpture(2, false)
    // Without food the begging marker is Credit's only branch.
    let response = choose(session, session.performRoundEnd(), CREDIT)
    expect(response.state.players[0]!.resources.begging).toBe(1)
    expect(values(response)).toEqual([SCULPTURE, '__pass__'])
    response = choose(session, response, SCULPTURE)
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 2, begging: 1 })
    expect(triggered(response, [CREDIT, SCULPTURE], 2)).toEqual([CREDIT, SCULPTURE])
  })

  it('neither fires at the end of a round that ends with a Harvest', () => {
    const session = creditAndSculpture(4, false)
    const response = toNextRound(session, session.performRoundEnd(), 4)
    expect(triggered(response, [CREDIT, SCULPTURE], 4)).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })
})

describe('the round-end window follows the seat setting', () => {
  const foodAndCredit = (manual: boolean) => roundEnd(2, state => {
    const owner = state.players[0]!
    owner.minorPlayed = [CREDIT, ROUND_END_FOOD]
    owner.resources.food = 1
    if (manual) orderReactionsManually(state)
  }, testCards)

  it('auto-resolve on: the plain gain settles first, then Credit asks for its own choice', () => {
    const session = foodAndCredit(false)
    let response = session.performRoundEnd()
    expect(response.state.players[0]!.resources.food).toBe(2)
    response = creditChoice(session, response, true)
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, begging: 0 })
    expect(triggered(response, [CREDIT, ROUND_END_FOOD], 2)).toEqual([ROUND_END_FOOD, CREDIT])
  })

  it.each([
    [CREDIT, ROUND_END_FOOD],
    [ROUND_END_FOOD, CREDIT],
  ])('auto-resolve off: %s first gives the same result', (first, second) => {
    const session = foodAndCredit(true)
    let response = session.performRoundEnd()
    expect(values(response)).toEqual([CREDIT, ROUND_END_FOOD, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    response = choose(session, response, first)
    response = creditChoice(session, response, true)
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, begging: 0 })
    expect(triggered(response, [CREDIT, ROUND_END_FOOD], 2)).toEqual([first, second])
  })

  it('Carrot Museum (a formula gain) is ordered with Credit in either setting', () => {
    for (const manual of [false, true]) {
      const session = roundEnd(8, state => {
        const owner = state.players[0]!
        owner.minorPlayed = [CREDIT, CARROT_MUSEUM]
        owner.fields = [{ row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] }]
        Object.assign(owner.resources, { food: 0, vegetable: 2 })
        if (manual) orderReactionsManually(state)
      })
      let response = session.performRoundEnd()
      expect(values(response)).toEqual([CREDIT, CARROT_MUSEUM, '__pass__'])
      response = choose(session, response, CARROT_MUSEUM)
      // Credit then runs alone: with no food it takes the begging marker.
      expect(response.state.round).toBe(9)
      expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, wood: 2, begging: 1 })
    }
  })
})

describe('cards moved into the round-end window', () => {
  it('Lifting Machine joins Sculpture Course after the workers came home', () => {
    const session = roundEnd(2, state => {
      const owner = state.players[0]!
      owner.minorPlayed = [LIFTING_MACHINE, SCULPTURE]
      owner.fields = [{ row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] }]
      owner.resources.wood = 1
    })
    let response = session.performRoundEnd()
    expect(windowOf(response)).toBe('__stage:onRoundEnd')
    expect(response.state.actionSpaces.every(space => space.takenBy.length === 0)).toBe(true)
    expect(values(response)).toEqual([LIFTING_MACHINE, SCULPTURE, '__pass__'])
    expect(passDisabled(response)).toBe(false)
    expect(waiting(choose(session, response, LIFTING_MACHINE)).request.kind).toBe('selection')
    response = session.commitSelectionChoice(0, { positions: ['0-1'] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'vegetable', remaining: 1 }])
    expect(values(response)).toEqual([SCULPTURE, '__pass__'])
  })

  it('Lifting Machine is not offered at the end of a Harvest round', () => {
    const session = roundEnd(4, state => {
      const owner = state.players[0]!
      owner.minorPlayed = [LIFTING_MACHINE]
      owner.fields = [{ row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] }]
    })
    const response = toNextRound(session, session.performRoundEnd(), 4)
    expect(triggered(response, [LIFTING_MACHINE], 4)).toEqual([])
  })

  it('Pig Breeder and Carrot Museum both resolve at the end of round 12', () => {
    const session = roundEnd(12, state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [PIG_BREEDER]
      owner.minorPlayed = [CARROT_MUSEUM]
      owner.fields = [{ row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] }]
      sheepPasture(state, 0, 'boar')
    })
    let response = session.performRoundEnd()
    expect(windowOf(response)).toBe('__stage:onRoundEnd')
    expect(values(response)).toEqual([CARROT_MUSEUM, PIG_BREEDER, '__pass__'])
    // Pig Breeder, then the sole mandatory source, breeds without asking.
    response = toNextRound(session, choose(session, response, CARROT_MUSEUM), 12)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 3, stone: 1 })
    expect(triggered(response, [PIG_BREEDER, CARROT_MUSEUM], 12)).toEqual([CARROT_MUSEUM, PIG_BREEDER])
  })
})

describe('the after-round window', () => {
  const breederAndFood = (manual: boolean) => roundEnd(2, state => {
    state.players[0]!.occupationPlayed = [PURE_BREEDER]
    state.players[0]!.minorPlayed = [AFTER_ROUND_FOOD]
    sheepPasture(state, 0)
    if (manual) orderReactionsManually(state)
  }, testCards)

  it('auto-resolve on: the plain gain settles, then Pure Breeder keeps [card, Pass]', () => {
    const session = breederAndFood(false)
    let response = session.performRoundEnd()
    expect(windowOf(response)).toBe('__stage:onAfterRoundEnd')
    expect(response.state.players[0]!.resources.food).toBe(11)
    expect(values(response)).toEqual([PURE_BREEDER, '__pass__'])
    response = toNextRound(session, choose(session, response, PURE_BREEDER), 2)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 3, food: 11 })
  })

  it.each([
    [PURE_BREEDER, AFTER_ROUND_FOOD],
    [AFTER_ROUND_FOOD, PURE_BREEDER],
  ])('auto-resolve off: %s first gives the same result', (first, second) => {
    const session = breederAndFood(true)
    let response = session.performRoundEnd()
    expect(values(response)).toEqual([AFTER_ROUND_FOOD, PURE_BREEDER, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    response = choose(session, response, first)
    if (first === AFTER_ROUND_FOOD) response = choose(session, response, PURE_BREEDER)
    response = toNextRound(session, response, 2)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 3, food: 11 })
    expect(triggered(response, [PURE_BREEDER, AFTER_ROUND_FOOD], 2)).toEqual([first, second])
  })

  it('runs after the round-end window', () => {
    const session = roundEnd(2, state => {
      state.players[0]!.occupationPlayed = [PURE_BREEDER]
      state.players[0]!.minorPlayed = [SCULPTURE]
      state.players[0]!.resources.wood = 1
      sheepPasture(state, 0)
    })
    let response = session.performRoundEnd()
    expect(windowOf(response)).toBe('__stage:onRoundEnd')
    expect(waiting(response).sourceCard).toBe(SCULPTURE)
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(windowOf(response)).toBe('__stage:onAfterRoundEnd')
    expect(waiting(response).sourceCard).toBe(PURE_BREEDER)
  })
})

describe('round-end windows go clockwise from the Start Player', () => {
  it('asks the Start Player P1 before P0', () => {
    const session = roundEnd(2, state => {
      startPlayer(state, 1)
      for (const player of state.players) {
        player.minorPlayed = [SCULPTURE]
        player.resources.wood = 1
      }
    })
    let response = session.performRoundEnd()
    expect(waiting(response).playerIndex).toBe(1)
    expect(waiting(response).sourceCard).toBe(SCULPTURE)
    response = session.resolveChoice(1, '__skip__')
    expect(response.ok, response.error).toBe(true)
    if (waiting(response).request.kind === 'confirm-player-switch') response = confirmPlayerSwitch(session)
    expect(waiting(response).playerIndex).toBe(0)
    expect(waiting(response).sourceCard).toBe(SCULPTURE)
  })
})
