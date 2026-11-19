import { describe, expect, it } from 'vitest'
import { playMinor, playOccupation, sessionOptions } from './_helpers/card-regression-session'
import { completePlowUse } from './_helpers/plow-use'
import {
  wmAction,
  wmBonus,
  wmChoose,
  wmConfirmations,
  wmEndRound,
  wmEvent,
  wmId as id,
  wmOk,
  wmPayment,
  wmSession,
} from './_helpers/classic-wm-session'

// Plan: new four-player work games with explicit hands and zero resources.
// Drive public placement, choice, harvest and undo commands; inspect resources,
// schedules, farm selections, card events, all four scores and negative triggers.
describe('WM resources, choices and passing cards in four-player sessions', () => {
  it.each(['grain-seeds', 'vegetable-seeds'])(
    'Apple Picker adds wood and food on %s, and undo restores them',
    (space) => {
      const session = wmSession([3], (state) => {
        if (space === 'vegetable-seeds') state.roundActionOrder[0] = space
      })
      const response = wmOk(session.takeAction(0, space))
      expect(response.state.players[0]!.resources).toMatchObject({
        wood: 1,
        food: 1,
        [space === 'grain-seeds' ? 'grain' : 'vegetable']: 1,
      })
      wmEvent(response, 3)
      expect(wmOk(session.undoAction()).state.players[0]!.resources).toMatchObject({
        wood: 0,
        food: 0,
      })
    },
  )
  it('Apple Picker does not reward Forest or an unplayed card', () => {
    const forest = wmSession([3])
    expect(wmOk(forest.takeAction(0, 'forest')).state.players[0]!.resources.food).toBe(0)
    const hand = wmSession([3], undefined, false)
    expect(wmOk(hand.takeAction(0, 'grain-seeds')).state.players[0]!.resources.wood).toBe(0)
  })
  it.each([1, 6])(
    'Herdsman grants a sheep before round six and a genuine animal choice afterwards (round %i)',
    (round) => {
      const session = wmSession([28], (state) => {
        state.round = round
      })
      let response = wmOk(session.takeAction(0, 'day-laborer'))
      if (round >= 6) {
        const boar = sessionOptions(response).find(
          (option) =>
            option.effectPreview?.kind === 'resourceExchange' &&
            option.effectPreview.resourcesGained?.boar === 1,
        )
        const choice =
          boar ?? sessionOptions(response).find((option) => JSON.stringify(option).includes('boar'))
        expect(choice, JSON.stringify(response.interaction)).toBeDefined()
        response = wmChoose(session, response, choice!.value)
      }
      expect(response.state.players[0]!.resources).toMatchObject({
        food: 2,
        [round < 6 ? 'sheep' : 'boar']: 1,
      })
      wmEvent(response, 28)
    },
  )
  it.each([2, 3, 4])(
    'Hill Farmer counts the current %i rooms after a real field is plowed',
    (rooms) => {
      const session = wmSession([29], (state) => {
        state.players[0]!.rooms = rooms
        state.players[0]!.roomTiles = [
          { row: 1, col: 0 },
          { row: 2, col: 0 },
          { row: 0, col: 0 },
          { row: 1, col: 1 },
        ].slice(0, rooms)
      })
      const offered = wmOk(session.takeAction(0, 'farmland'))
      if (
        offered.interaction.stateId !== 'wait' ||
        offered.interaction.request.kind !== 'farm-select'
      )
        throw new Error('Expected plow')
      const response = wmOk(
        session.commitSelectionChoice(0, {
          tile: offered.interaction.request.farm.selectableTiles[0]!,
        }),
      )
      expect(response.state.players[0]!.resources.food).toBe(rooms === 2 ? 2 : rooms === 3 ? 1 : 0)
    },
  )
  it('Buried Treasure rewards Cultivation but not the Grain Seeds space', () => {
    const session = wmSession([67], (state) => {
      state.roundActionOrder[0] = 'cultivation'
    })
    const response = completePlowUse(session, session.takeAction(0, 'cultivation'), id(67), 0)
    expect(response.state.players[0]!.resources.stone).toBe(1)
    wmEvent(response, 67)
    const other = wmSession([67])
    expect(wmOk(other.takeAction(0, 'grain-seeds')).state.players[0]!.resources.stone).toBe(0)
  })
  it('Apprenticeship pays its food, permits a free occupation only when strictly last, and passes', () => {
    const session = wmSession(
      [59, 3],
      (state) => {
        state.players[0]!.resources.food = 1
        state.players.slice(1).forEach((p) => {
          p.occupationPlayed = ['__occupation__']
        })
      },
      false,
    )
    let response = wmPayment(session, playMinor(session, id(59)))
    response = wmAction(session, response, 'actions.lessons.name')
    if (response.state.players[0]!.occupationHand.includes(id(3)))
      response = wmChoose(session, response, id(3))
    expect(response.state.players[0]!.occupationPlayed).toContain(id(3))
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain(id(59))
    expect(response.state.players[0]!.minorPlayed).not.toContain(id(59))
    const tied = wmSession(
      [59, 3],
      (state) => {
        state.players[0]!.resources.food = 1
      },
      false,
    )
    const skipped = wmPayment(tied, playMinor(tied, id(59)))
    expect(skipped.state.players[0]!.occupationPlayed).not.toContain(id(3))
    expect(skipped.state.players[1]!.minorHand).toContain(id(59))
  })
  it('Prizewinning Sheep chooses a building resource, passes and restores both hands on undo', () => {
    const session = wmSession(
      [101],
      (state) => {
        state.players[0]!.resources.sheep = 1
        state.players[0]!.houseAnimals = { '1-0': 'sheep' }
      },
      false,
    )
    let response = wmPayment(session, playMinor(session, id(101)))
    const choice = sessionOptions(response).find((option) =>
      JSON.stringify(option).includes('stone'),
    )!
    response = wmChoose(session, response, choice.value)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, stone: 1 })
    expect(response.state.players[1]!.minorHand).toContain(id(101))
    wmEvent(response, 101)
    const undone = wmOk(session.undoAction())
    expect(undone.state.players[0]!.minorHand).toContain(id(101))
    expect(undone.state.players[1]!.minorHand).not.toContain(id(101))
  })
  it.each([
    { n: 31, resource: 'wood' },
    { n: 52, resource: 'clay' },
  ])(
    '$n gives the printed resource reward for six complete remaining rounds',
    ({ n, resource }) => {
      const session = wmSession(
        [n],
        (state) => {
          state.round = 8
        },
        false,
      )
      const response = wmPayment(session, playOccupation(session, id(n)))
      expect(response.state.players[0]!.resources[resource as 'wood' | 'clay']).toBe(3)
      wmEvent(response, n)
    },
  )
})

describe('WM future rewards, storage and plow uses', () => {
  it.each([
    { n: 73, round: 12, rounds: [13, 14], resources: { stone: 1 } },
    { n: 73, round: 14, rounds: [], resources: { stone: 1 } },
    { n: 82, round: 6, rounds: [8], resources: { vegetable: 1 } },
    { n: 82, round: 7, rounds: [], resources: { vegetable: 1 } },
    { n: 111, round: 4, rounds: [5, 6, 7], resources: { food: 1 } },
    { n: 111, round: 1, rounds: [], resources: { food: 1 } },
  ])('$n played in round $round queues exactly $rounds', ({ n, round, rounds, resources }) => {
    const session = wmSession(
      [n],
      (state) => {
        state.round = round
        state.players[0]!.resources.clay = 1
        if (n === 73) state.players[0]!.occupationPlayed = ['__1__', '__2__', '__3__']
      },
      false,
    )
    const response = wmPayment(session, playMinor(session, id(n)))
    expect(response.state.players[0]!.minorPlayed).toContain(id(n))
    expect(
      response.state.futureMeeples
        .filter((entry) => entry.cardId === id(n))
        .map((entry) => ({ round: entry.round, resources: entry.resources })),
    ).toEqual(rounds.map((round) => ({ round, resources })))
    wmEvent(response, n)
  })
  it('Plum Patch requires both crop kinds and counts planted fields, not crops', () => {
    const session = wmSession(
      [100],
      (state) => {
        state.round = 10
        state.players[0]!.fields = [
          { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] },
          { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] },
          { row: 0, col: 3, stacks: [] },
        ]
      },
      false,
    )
    const response = wmPayment(session, playMinor(session, id(100)))
    expect(
      response.state.futureMeeples
        .filter((entry) => entry.cardId === id(100))
        .map((entry) => entry.round),
    ).toEqual([11, 12])
    const bare = wmSession([100], undefined, false)
    expect(playMinor(bare, id(100)).state.players[0]!.minorHand).toContain(id(100))
  })
  it('Diamond Mine pays the first scheduled stone at round start and removes only that entry', () => {
    const session = wmSession(
      [73],
      (state) => {
        state.players[0]!.occupationPlayed = ['__1__', '__2__', '__3__']
      },
      false,
    )
    wmPayment(session, playMinor(session, id(73)))
    const response = wmEndRound(session, 1)
    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.resources.stone).toBe(1)
    expect(
      response.state.futureMeeples
        .filter((entry) => entry.cardId === id(73))
        .map((entry) => entry.round),
    ).toEqual([3])
  })
  it('Drained Pond charges food only if the scheduled plow is accepted', () => {
    const session = wmSession(
      [76],
      (state) => {
        state.players[0]!.resources.reed = 1
        state.players[0]!.occupationPlayed = ['__1__', '__2__']
      },
      false,
    )
    wmPayment(session, playMinor(session, id(76)))
    let response = wmConfirmations(session, wmEndRound(session, 4))
    response = wmAction(session, response, 'actions.activate-card-effect.name')
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    response = wmOk(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
    expect(response.state.players[0]!.resources.food).toBe(35)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    wmEvent(response, 76)
  })
  it('Steel Plow spends one complete use for four fields and undo restores the use', () => {
    const session = wmSession(
      [109],
      (state) => {
        state.players[0]!.resources.stone = 3
        state.players[0]!.occupationPlayed = ['__1__', '__2__', '__3__']
      },
      false,
    )
    wmPayment(session, playMinor(session, id(109)))
    session.state.currentPlayerIndex = 0
    session.loadState(session.state)
    const response = completePlowUse(session, session.takeAction(0, 'farmland'), id(109), 3)
    expect(response.state.players[0]!.fields).toHaveLength(4)
    expect(response.state.players[0]!.cardStates[id(109)]!.stack).toHaveLength(0)
    const undone = wmOk(session.undoAction())
    expect(undone.state.players[0]!.cardStates[id(109)]!.stack).toHaveLength(3)
    expect(undone.state.players[0]!.fields).toHaveLength(0)
  })
  it('Worm Bait stores two food on Farmland and retrieves them on Fishing', () => {
    const session = wmSession([115])
    wmOk(session.takeAction(0, 'farmland'))
    let response = wmOk(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
    expect(response.state.players[0]!.cardStates[id(115)]!.counters!.food).toBe(2)
    session.state.currentPlayerIndex = 0
    session.loadState(session.state)
    response = wmOk(session.takeAction(0, 'fishing'))
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.players[0]!.cardStates[id(115)]!.counters!.food).toBe(0)
    wmEvent(response, 115)
  })
  it('Ruins stores four stones when bought and returns exactly one per harvest', () => {
    const session = wmSession(
      [106],
      (state) => {
        state.players[0]!.resources.stone = 4
      },
      false,
    )
    const bought = wmPayment(session, playMinor(session, id(106)))
    expect(bought.state.players[0]!.resources.stone).toBe(0)
    expect(bought.state.players[0]!.cardStates[id(106)]!.counters!.stone).toBe(4)
    const response = wmConfirmations(session, wmEndRound(session, 4))
    expect(response.state.players[0]!.resources.stone).toBe(1)
    expect(response.state.players[0]!.cardStates[id(106)]!.counters!.stone).toBe(3)
    wmEvent(response, 106)
  })
})

describe('WM scoring is read from current farm state', () => {
  it.each([0, 1, 2, 3, 4])('Minimalist awards the printed tier with %i improvements', (count) => {
    const session = wmSession([38], (state) => {
      state.players[0]!.minorPlayed = Array.from({ length: count }, (_, i) => `__minor${i}__`)
    })
    expect(wmBonus(session.getState(), 38)).toBe([9, 6, 4, 2, 0][count])
  })
  it('Cloister Dweller scores complete columns separately, but never combines different pasture regions', () => {
    const session = wmSession([10], (state) => {
      const p = state.players[0]!
      p.roomTiles = [0, 1, 2].map((row) => ({ row, col: 0 }))
      p.rooms = 3
      p.fields = [0, 1, 2].map((row) => ({ row, col: 1, stacks: [] }))
      p.pastures = [
        {
          id: 'whole',
          tiles: [0, 1, 2].map((row) => ({ row, col: 2 })),
          animalType: null,
          animalCount: 0,
        },
        { id: 'top', tiles: [{ row: 0, col: 3 }], animalType: null, animalCount: 0 },
        {
          id: 'bottom',
          tiles: [1, 2].map((row) => ({ row, col: 3 })),
          animalType: null,
          animalCount: 0,
        },
      ]
    })
    expect(wmBonus(session.getState(), 10)).toBe(3)
  })
  it('Boundary Stones scores only fields with exactly one orthogonal field neighbor', () => {
    const session = wmSession([65], (state) => {
      state.players[0]!.fields = [1, 2, 3].map((col) => ({ row: 0, col, stacks: [] }))
    })
    expect(wmBonus(session.getState(), 65)).toBe(1)
  })
  it('Tavern Keeper gains grain and food at harvest and scores empty rooms', () => {
    const session = wmSession([51], (state) => {
      state.players[0]!.rooms = 3
      state.players[0]!.roomTiles.push({ row: 0, col: 0 })
    })
    expect(wmBonus(session.getState(), 51)).toBe(1)
    const response = wmConfirmations(session, wmEndRound(session, 4))
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 37 })
    wmEvent(response, 51)
  })
  it('Petting Zoo excludes animals on cards from all three species and threshold checks', () => {
    const session = wmSession([98], (state) => {
      const p = state.players[0]!
      p.pastures = [
        { id: 'sheep', tiles: [{ row: 0, col: 1 }], animalType: 'sheep', animalCount: 2 },
        { id: 'boar', tiles: [{ row: 0, col: 2 }], animalType: 'boar', animalCount: 2 },
      ]
      Object.assign(p.resources, { sheep: 2, boar: 2, cattle: 1 })
      p.cardStates.__holder__ = { extraData: { animalCounts: { cattle: 1 } } }
    })
    expect(wmBonus(session.getState(), 98)).toBe(0)
    session.state.players[0]!.houseAnimals = { '1-0': 'cattle' }
    session.state.players[0]!.cardStates = {}
    session.loadState(session.state)
    expect(wmBonus(session.getState(), 98)).toBe(2)
  })
})
