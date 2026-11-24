import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { choose, playImprovement, playOccupation, restoreSession } from './_helpers/card-play-lifecycle'
import { confirmTurns } from './_helpers/classic-fl'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { orderReactionsManually } from './_helpers/trigger-select'

const GIFT = 'CFL013_GiftTable'
const SELLER = 'CFL036_VegetableSeller'
const ACCOUNTANT = 'CFL049_Accountant'
const PEASANT = 'B133_VillagePeasant'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function fresh(configure: (state: GameState) => void, playerCount = 2) {
  const session = createWorkSession({ seed: 13036, options: { playerCount }, configure })
  sessions.push(session)
  return session
}

const endRound = (session: GameSession, firstCard?: string) => autoAdvanceRoundEnd(session, {
  onChoice: (interaction) => {
    const options = interaction.request.options ?? []
    const option = options.find(o => o.value === firstCard && !o.disabled)
      ?? options.find(o => ['__skip__', '__pass__'].includes(o.value) && !o.disabled)
    if (option) return session.resolveChoice(interaction.playerIndex, option.value)
  },
})

function housedSheep(state: GameState) {
  const player = state.players[0]!
  player.houseAnimals = { '2-0': 'sheep' }
  player.resources.sheep = 1
}

describe('CFL013 Gift Table', () => {
  it('buys the five goods in stack order, and trades only the gift sheep for two food', () => {
    const session = fresh(state => {
      const owner = state.players[0]!
      owner.minorHand = [GIFT]
      Object.assign(owner.resources, { wood: 1, food: 5, grain: 0, vegetable: 0 })
      housedSheep(state)
      markAllWorkersUsed(state, state.players[1]!)
    })
    let response = confirmTurns(session, playImprovement(session, GIFT, 'meeting-place'))
    expect(response.state.players[0]!.cardStates[GIFT]?.stack).toEqual(['vegetable', 'wood', 'sheep', 'wood', 'grain'])
    for (const good of ['grain', 'wood', 'sheep', 'wood', 'vegetable']) {
      response = session.takeAnytimeAction(0, GIFT + '-buy')
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
        expect(good).toBe('sheep')
        expect(response.interaction.request.zones).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: 'card:' + GIFT, animalType: 'sheep', animalCount: 1 }),
          expect.objectContaining({ id: 'house:2-0', animalType: 'sheep', animalCount: 1 }),
        ]))
        response = session.resolveChoice(0, 'confirm', { zones: response.interaction.request.zones })
        expect(response.ok, response.error).toBe(true)
      }
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.from.kind === 'card' && event.from.cardId === GIFT).at(-1))
        .toMatchObject({ resources: { [good]: 1 } })
    }
    const player = response.state.players[0]!
    expect(player.resources).toMatchObject({ wood: 2, grain: 1, vegetable: 1, sheep: 2, food: 0 })
    expect(response.scores?.[0]?.categories.find(category => category.key === 'sheeps')?.quantity).toBe(2)
    expect(player.cardStates[GIFT]?.stack).toEqual([])
    expect(session.takeAnytimeAction(0, GIFT + '-buy').ok).toBe(false)

    response = session.takeAnytimeAction(0, GIFT + '-exchange')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, sheep: 1 })
    expect(Object.values(response.state.players[0]!.houseAnimals)).toEqual(['sheep'])
    expect(response.state.events.filter(event => event.type === 'resource.exchanged').at(-1)).toMatchObject({
      paid: { sheep: 1 }, gained: { food: 2 }, exchangeSource: GIFT,
    })
    expect(session.takeAnytimeAction(0, GIFT + '-exchange').ok).toBe(false)
  })

  it('cooks the housed sheep first in a Fireplace, and clears the gift when the last sheep is cooked', () => {
    const session = fresh(state => {
      housedSheep(state)
      const owner = state.players[0]!
      owner.resources.sheep = 2
      owner.minorPlayed = [GIFT]
      owner.improvements = ['Major_Fireplace1']
      owner.cardStates[GIFT] = { counters: { held: 1 } }
    })
    function cookOne() {
      const pending = session.takeAnytimeAction(0, 'exchange')
      if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') throw new Error('Expected cooking menu')
      const fireplace = pending.interaction.request.options.find(option =>
        option.sourceCard === 'Major_Fireplace1' && option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.sheep)
      expect(fireplace).toBeDefined()
      const response = session.resolveChoice(0, 'bulk:' + fireplace!.value.split(':')[1] + '=1')
      expect(response.ok, response.error).toBe(true)
      return response
    }
    const first = cookOne()
    expect(first.state.players[0]!.resources.sheep).toBe(1)
    expect(Object.values(first.state.players[0]!.houseAnimals)).not.toContain('sheep')
    expect(first.state.players[0]!.cardStates[GIFT]?.counters?.held).toBe(1)
    const last = cookOne()
    expect(last.state.players[0]!.resources.sheep).toBe(0)
    expect(last.state.players[0]!.cardStates[GIFT]?.counters?.held).toBe(0)
    expect(session.takeAnytimeAction(0, GIFT + '-exchange').ok).toBe(false)
  })

  it('keeps an unaffordable top good, and a gift sheep with one normal sheep does not breed', () => {
    const session = fresh(state => {
      state.round = 4
      housedSheep(state)
      const owner = state.players[0]!
      owner.resources.sheep = 2
      owner.minorPlayed = [GIFT]
      owner.cardStates[GIFT] = { stack: ['vegetable'], counters: { held: 1 } }
      owner.resources.food = 0
      for (const player of state.players) markAllWorkersUsed(state, player)
    })
    expect(session.takeAnytimeAction(0, GIFT + '-buy').ok).toBe(false)
    expect(session.getState().state.players[0]!.cardStates[GIFT]!.stack).toEqual(['vegetable'])
    const response = endRound(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(response.state.events.some(event => event.type === 'farm.animalBred' && event.actorPlayerId === 'p1')).toBe(false)
  })
})

describe('CFL036 Vegetable Seller', () => {
  it('converts a loan immediately, keeps its debt on restore and exchanges owned vegetables without borrowing', () => {
    const session = fresh(state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [SELLER]
      Object.assign(owner.resources, { food: 0, vegetable: 0 })
    })
    const borrowed = session.takeAnytimeAction(0, SELLER + '-borrow')
    expect(borrowed.ok, borrowed.error).toBe(true)
    expect(borrowed.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 2 })
    expect(borrowed.state.players[0]!.cardStates[SELLER]?.counters?.borrowedVegetables).toBe(1)
    expect(borrowed.state.events.filter(event => event.type === 'resource.exchanged')).toMatchObject([
      { paid: {}, gained: { food: 2 }, exchangeSource: SELLER },
    ])
    expect(borrowed.state.events.some(event => event.type === 'resource.moved' && event.resources.vegetable)).toBe(false)
    expect(borrowed.state.log.length).toBeGreaterThan(0)
    const restored = restoreSession(session)
    sessions.push(restored)
    expect(restored.state.players[0]!.cardStates[SELLER]?.counters?.borrowedVegetables).toBe(1)

    const stocked = fresh(state => {
      state.players[0]!.occupationPlayed = [SELLER]
      Object.assign(state.players[0]!.resources, { vegetable: 1, food: 0 })
    })
    const pending = stocked.takeAnytimeAction(0, 'exchange')
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') throw new Error('Expected exchange menu')
    const recipe = pending.interaction.request.options.find(option => option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesGained?.food === 2 && option.effectPreview.resourcesPaid?.vegetable === 1)
    expect(recipe).toBeDefined()
    const own = choose(stocked, pending, recipe!.value)
    expect(own.state.players[0]!.resources).toMatchObject({ food: 2, vegetable: 0 })
    expect(own.state.players[0]!.cardStates[SELLER]?.counters?.borrowedVegetables ?? 0).toBe(0)
  })

  it.each([
    { first: PEASANT, manual: false, begging: 1, remains: 0 },
    { first: PEASANT, manual: true, begging: 1, remains: 0 },
    { first: SELLER, manual: true, begging: 2, remains: 1 },
  ])('settles three debts against the live supply with $first first (manual=$manual)', ({ first, manual, begging, remains }) => {
    const session = fresh(state => {
      state.round = 14
      for (const player of state.players) {
        player.resources.food = 10
        markAllWorkersUsed(state, player)
      }
      const owner = state.players[0]!
      owner.occupationPlayed = [SELLER, PEASANT]
      owner.improvements = ['Major_ClayOven']
      owner.minorPlayed = ['A016_RammedClay']
      owner.resources.vegetable = 1
      owner.cardStates[SELLER] = { counters: { borrowedVegetables: 3 } }
      if (manual) orderReactionsManually(state)
    })
    const response = endRound(session, first)
    expect(response.state.gameOver).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 6, begging, vegetable: remains })
    expect(response.state.players[0]!.cardStates[SELLER]!.counters?.borrowedVegetables).toBe(0)
    expect(response.scores?.[0]?.categories.find(row => row.key === 'beggings')?.total).toBe(-3 * begging)
  })
})

describe('CFL049 Accountant', () => {
  it.each([[3, 2], [4, 1], [5, 0]])('pays the %i-player reward once and earns no food for playing itself', (players, wood) => {
    const session = fresh(state => {
      state.players[0]!.resources.wood = 0
      state.players[0]!.occupationHand = [ACCOUNTANT]
    }, players)
    const response = playOccupation(session, ACCOUNTANT)
    expect(response.state.players[0]!.resources.wood).toBe(wood)
    expect(response.state.players[0]!.cardStates[ACCOUNTANT]?.counters?.food ?? 0).toBe(0)
  })

  it.each([0, 1])('stores food when player %i plays their next occupation', seat => {
    const session = fresh(state => {
      state.currentPlayerIndex = seat
      state.players[0]!.occupationPlayed = [ACCOUNTANT]
      state.players[seat]!.occupationHand = ['CWM006_Borrower']
      state.players[seat]!.resources.food = 3
    })
    const response = confirmTurns(session, playOccupation(session, 'CWM006_Borrower', seat))
    expect(response.state.players[0]!.cardStates[ACCOUNTANT]?.counters?.food).toBe(1)
    expect(response.state.players[1]!.cardStates[ACCOUNTANT]).toBeUndefined()
  })

  it.each(['vegetable', 'cattle'] as const)('buys one %s for four stored food before scoring, after Vegetable Seller settled', good => {
    const session = fresh(state => {
      state.round = 14
      for (const player of state.players) {
        player.resources.food = 10
        markAllWorkersUsed(state, player)
      }
      const owner = state.players[0]!
      owner.occupationPlayed = [ACCOUNTANT, SELLER]
      owner.cardStates[SELLER] = { counters: { borrowedVegetables: 1 } }
      owner.cardStates[ACCOUNTANT] = { counters: { food: 4 } }
    })
    let bought = false
    const response = autoAdvanceRoundEnd(session, { onChoice: interaction => {
      const options = interaction.request.options ?? []
      const accountant = options.find(option => option.sourceCard === ACCOUNTANT && !option.disabled)
      if (!bought && accountant) {
        expect(options.some(option => option.sourceCard === SELLER)).toBe(false)
        expect(session.takeAnytimeAction(0, SELLER + '-borrow').ok).toBe(false)
        const menu = session.resolveChoice(0, accountant.value)
        if (menu.interaction.stateId !== 'wait' || menu.interaction.request.kind !== 'choice') throw new Error('Expected Accountant goods')
        const item = menu.interaction.request.options.find(option =>
          option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.[good] === 1)
        expect(item).toBeDefined()
        bought = true
        const purchased = session.resolveChoice(0, item!.value)
        if (good === 'cattle') {
          if (purchased.interaction.stateId !== 'wait' || purchased.interaction.request.kind !== 'animal-reorg') throw new Error('Expected cattle placement')
          expect(purchased.interaction.anytimeActions.some(action => action.id === SELLER + '-borrow')).toBe(false)
          expect(session.takeAnytimeAction(0, SELLER + '-borrow').ok).toBe(false)
        }
        return purchased
      }
      const skip = options.find(option => !option.disabled && ['__skip__', '__pass__'].includes(option.value))
      if (skip) return session.resolveChoice(interaction.playerIndex, skip.value)
    } })
    expect(bought).toBe(true)
    expect(response.state.gameOver).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 6, [good]: 1, begging: 1 })
    expect(response.state.players[0]!.cardStates[ACCOUNTANT]?.counters?.food).toBe(0)
  })

  it('offers only goods affordable from the card, ignoring food in supply and rejecting an overspend', () => {
    const session = fresh(state => {
      state.players[0]!.occupationPlayed = [ACCOUNTANT]
      state.players[0]!.resources.food = 9
      state.players[0]!.cardStates[ACCOUNTANT] = { counters: { food: 3 } }
    })
    const pending = session.takeAnytimeAction(0, ACCOUNTANT + '-buy')
    if (pending.interaction.stateId !== 'wait') throw new Error('Expected Accountant purchase menu')
    expect(pending.interaction.request.options?.map(option => option.labelParams?.resourcesGained), JSON.stringify(pending.interaction.request.options)).toEqual([{ sheep: 1 }, { stone: 1 }, { boar: 1 }, { grain: 1 }])
    expect(session.resolveChoice(0, 'cattle').ok).toBe(false)
    const response = choose(session, session.getState(), pending.interaction.request.options![3]!.value)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 9, grain: 1 })
    expect(response.state.players[0]!.cardStates[ACCOUNTANT]?.counters?.food).toBe(0)
    expect(session.takeAnytimeAction(0, ACCOUNTANT + '-buy').ok).toBe(false)
  })
})
