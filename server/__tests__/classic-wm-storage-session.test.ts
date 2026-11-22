import { describe, expect, it } from 'vitest'
import { countOccupations } from '../../shared/cards/helpers/prerequisites'
import { computeHarvestFeedingRequirement } from '../../shared/actions/helpers/harvest-feeding-requirement'
import { playMinor, playOccupation, sessionOptions } from './_helpers/card-regression-session'
import {
  wmAction,
  wmChoose,
  wmConfirmations,
  wmEndRound,
  wmEvent,
  wmId as id,
  wmOk,
  wmPayment,
  wmSession
} from './_helpers/classic-wm-session'
import type { GameSession, SessionResponse } from '../game/authoritative-session'

function anytime(session: GameSession, n: number) {
  const action = session
    .getState()
    .interaction.anytimeActions.find((action) => action.sourceCard === id(n))
  expect(action, JSON.stringify(session.getState().interaction)).toBeDefined()
  return wmOk(session.takeAnytimeAction(0, action!.id))
}
function chooseResource(session: GameSession, response: SessionResponse, resource: string) {
  const choice = sessionOptions(response).find(
    (option) => !option.disabled && JSON.stringify(option).includes(resource),
  )
  expect(choice, JSON.stringify(response.interaction)).toBeDefined()
  return wmPayment(session, wmChoose(session, response, choice!.value))
}

describe('WM stored goods and per-round counters in four-player games', () => {
  it('Covetous Farmer can take only a missing resource held by every opponent, once per round', () => {
    const session = wmSession([12], (state) => {
      state.players.slice(1).forEach((p) => {
        p.resources.wood = 1
        p.resources.clay = 1
      })
      state.players[2]!.resources.clay = 0
    })
    let response = anytime(session, 12)
    if (sessionOptions(response).some((option) => JSON.stringify(option).includes('wood')))
      response = chooseResource(session, response, 'wood')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0 })
    expect(response.state.players[0]!.cardStates[id(12)]!.extraData!.usedRound).toBe(1)
    expect(response.interaction.anytimeActions.some((action) => action.sourceCard === id(12))).toBe(
      false,
    )
    wmEvent(response, 12)
  })
  it('Covetous Farmer does not activate without a common resource', () => {
    const session = wmSession([12])
    expect(
      session.getState().interaction.anytimeActions.some((action) => action.sourceCard === id(12)),
    ).toBe(false)
  })
  it('Politician gives a stone, exchanges in both directions, enforces two total uses and resets next round', () => {
    const session = wmSession([41], undefined, false)
    let response = wmPayment(session, playOccupation(session, id(41)))
    expect(response.state.players[0]!.resources.stone).toBe(1)
    session.loadState(session.state)
    response = wmPayment(session, anytime(session, 41))
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 0 })
    response = wmPayment(session, anytime(session, 41))
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 1 })
    expect(response.interaction.anytimeActions.some((action) => action.sourceCard === id(41))).toBe(
      false,
    )
    wmEndRound(session, 1)
    response = wmPayment(session, anytime(session, 41))
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 0 })
  })
  it('Oak Cask grows before feeding, allows a partial withdrawal, and cannot regrow after emptying', () => {
    const session = wmSession(
      [96],
      (state) => {
        state.players[0]!.resources.wood = 1
      },
      false,
    )
    let response = wmPayment(session, playMinor(session, id(96)))
    expect(response.state.players[0]!.cardStates[id(96)]!.counters!.food).toBe(1)
    response = wmConfirmations(session, wmEndRound(session, 4))
    // The post-reap anytime window exposes the stored food; move to the next work round without taking it.
    expect(response.state.players[0]!.cardStates[id(96)]!.counters!.food).toBe(2)
    response = anytime(session, 96)
    const one = sessionOptions(response).find(
      (option) =>
        option.effectPreview?.kind === 'resourceMovement' &&
        option.effectPreview.resources.food === 1,
    )!
    response = wmChoose(session, response, one.value)
    expect(response.state.players[0]!.cardStates[id(96)]!.counters!.food).toBe(1)
    response = anytime(session, 96)
    expect(response.state.players[0]!.cardStates[id(96)]!.counters!.food).toBe(0)
    response = wmConfirmations(session, wmEndRound(session, 7))
    expect(response.state.players[0]!.cardStates[id(96)]!.counters!.food).toBe(0)
    wmEvent(response, 96)
  })
  it('Grain Elevator caps storage at player count and the owner collects it with Grain Seeds', () => {
    const session = wmSession([88], (state) => {
      state.players[0]!.cardStates[id(88)] = { counters: { grain: 4 } }
    })
    let response = wmConfirmations(session, wmEndRound(session, 1))
    expect(response.state.players[0]!.cardStates[id(88)]!.counters!.grain).toBe(4)
    response = wmOk(session.takeAction(0, 'grain-seeds'))
    expect(response.state.players[0]!.resources.grain).toBe(5)
    expect(response.state.players[0]!.cardStates[id(88)]!.counters!.grain).toBe(0)
    wmEvent(response, 88)
  })
  it('An opponent clears Grain Elevator without receiving its grain', () => {
    const session = wmSession([88], (state) => {
      state.currentPlayerIndex = 1
      state.players[0]!.cardStates[id(88)] = { counters: { grain: 3 } }
    })
    const response = wmConfirmations(session, session.takeAction(1, 'grain-seeds'))
    expect(response.state.players[0]!.cardStates[id(88)]!.counters!.grain).toBe(0)
    expect(response.state.players[1]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})

describe('WM occupational identity, feeding and animal housing', () => {
  it('Clockwork Man counts as an occupation without charging for a first occupation card or triggering Bookshelf', () => {
    const session = wmSession(
      [70, 3],
      (state) => {
        state.players[0]!.minorPlayed = ['D049_Bookshelf']
      },
      false,
    )
    let response = wmPayment(session, playMinor(session, id(70)))
    session.withCtx(() => expect(countOccupations(response.state.players[0]!)).toBe(1))
    expect(response.state.players[0]!.occupationPlayed).toEqual([])
    expect(response.state.players[0]!.resources.food).toBe(0)
    session.loadState(session.state)
    response = wmPayment(session, playOccupation(session, id(3)))
    expect(response.state.players[0]!.occupationPlayed).toEqual([id(3)])
    expect(response.state.players[0]!.resources.food).toBe(3)
    session.withCtx(() => expect(countOccupations(response.state.players[0]!)).toBe(2))
  })
  it('Fruitcake discounts only the next feeding, including newborns', () => {
    const session = wmSession(
      [85],
      (state) => {
        state.players[0]!.occupationPlayed = ['__1__', '__2__']
        state.players[0]!.resources.wood = 1
      },
      false,
    )
    wmPayment(session, playMinor(session, id(85)))
    session.withCtx(() =>
      expect(computeHarvestFeedingRequirement(session.state, session.state.players[0]!)).toBe(2),
    )
    let response = wmConfirmations(session, wmEndRound(session, 4))
    expect(response.state.players[0]!.resources.food).toBe(38)
    response = wmConfirmations(session, wmEndRound(session, 7))
    expect(response.state.players[0]!.resources.food).toBe(36)
  })
  it('Kindling permits a one-clay Fireplace on Meeting Place', () => {
    const session = wmSession([93], (state) => {
      state.players[0]!.resources.clay = 1
    })
    let response = wmOk(session.takeAction(0, 'meeting-place'))
    response = wmAction(session, response, 'actions.improvement.name')
    const fireplace = sessionOptions(response).find((option) =>
      option.value.includes('Major_Fireplace1'),
    )!
    if (fireplace) response = wmPayment(session, wmChoose(session, response, fireplace.value))
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })
})

describe('WM resource conversions use real payments', () => {
  it.each([
    { resource: 'vegetable', food: 5 },
    { resource: 'sheep', food: 4 },
    { resource: 'boar', food: 5 },
    { resource: 'cattle', food: 6 },
  ] as const)(
    'Steamer turns grain and $resource into $food food exactly once per ingredient set',
    ({ resource, food }) => {
      const session = wmSession([108], (state) => {
        const p = state.players[0]!
        p.resources.grain = 1
        p.resources[resource] = 1
        if (resource !== 'vegetable') p.houseAnimals = { '1-0': resource }
      })
      let response = wmOk(session.takeAnytimeAction(0, 'exchange'))
      const recipe = sessionOptions(response).find(
        (option) =>
          option.sourceCard === id(108) &&
          option.effectPreview?.kind === 'resourceExchange' &&
          option.effectPreview.resourcesPaid?.[resource] === 1,
      )!
      response = wmChoose(session, response, recipe.value)
      expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, [resource]: 0, food })
      wmEvent(response, 108)
      expect(
        response.state.events.filter(
          (event) => event.type === 'resource.exchanged' && event.exchangeSource === id(108),
        ),
      ).toHaveLength(1)
    },
  )
  it('Lamp Oil supplies the food needed to pay for an occupation', () => {
    const session = wmSession(
      [94, 3],
      (state) => {
        state.players[0]!.occupationPlayed = ['__occupation__']
        state.players[0]!.minorPlayed = [id(94)]
      },
      false,
    )
    const response = wmPayment(session, playOccupation(session, id(3)))
    expect(response.state.players[0]!.occupationPlayed).toContain(id(3))
    expect(response.state.players[0]!.resources.food).toBe(0)
    wmEvent(response, 94)
  })
})
