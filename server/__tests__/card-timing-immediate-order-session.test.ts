import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'
import type { GameState } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'

const AFTER = 'TEST_1335_After'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []
function choose(session: GameSession, response: SessionResponse, value: string) {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a choice')
  if (response.interaction.request.kind !== 'confirm-player-switch') {
    expect(options(response).some(option => option.value === value && !option.disabled), JSON.stringify(response.interaction)).toBe(true)
  }
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
function accept(session: GameSession, response: SessionResponse) {
  const option = options(response).find(candidate => candidate.value !== '__skip__' && !candidate.disabled)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return choose(session, response, option!.value)
}
function setup({ cards, playerCount = 2, moor = false, actor = 0, configure }: {
  cards: string[]; playerCount?: number; moor?: boolean; actor?: number; configure?: (state: GameState) => void
}) {
  const session = createWorkSession({ seed: 1335, options: { playerCount, enableFarmersOfTheMoor: moor, allowIncompleteFarmersOfTheMoorMinorDeal: moor }, configure: state => {
    state.round = 8
    state.currentPlayerIndex = actor
    for (const player of state.players) {
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
      setWorkersAtHome(state, player, 2)
      player.farmTerrain = []
    }
    for (const space of state.actionSpaces) space.takenBy = []
    const owner = state.players[0]!
    owner.occupationPlayed = cards.filter(card => !card.startsWith('M'))
    owner.minorPlayed = [AFTER, ...cards.filter(card => card.startsWith('M'))]
    configure?.(state)
  } })
  sessions.push(session)
  return session
}
function companion(session: GameSession, selector: Pick<CardListenerRegistration, 'actions' | 'actionSpaces'>, scope: CardListenerRegistration['scope'] = 'player') {
  session.withCtx(() => requireActiveCardRegistry('card-immediate-order-test').registerListener({
    id: 'test-1335-after', cardIds: [AFTER], ...selector, scope, phases: ['after'],
    handler: () => ({ sourceCard: AFTER, flow: {
      type: 'leaf', actionId: 'gain', sourceCard: AFTER, params: { reed: 1 }, optional: true,
    } }),
  }))
}
function expectAfter(response: SessionResponse) {
  expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(AFTER)
  expect(response.state.players[0]!.resources.reed).toBe(0)
  expect(response.state.log.length).toBeGreaterThan(0)
  expect(response.scores).toHaveLength(response.state.players.length)
}

describe('printed immediate timing on five-plus cards', () => {
  it('Sidekick completes its leftward person use before ordinary after reactions', () => {
    const card = 'A171_Sidekick'
    const session = setup({ cards: [card], playerCount: 5, configure: state => {
      state.roundActionOrder[0] = 'vegetable-seeds'
      state.roundActionOrder[1] = 'eastern-quarry'
      state.players[0]!.resources.food = 1
      state.actionSpaces.find(space => space.id === 'eastern-quarry')!.resources.stone = 3
    } })
    companion(session, { actionSpaces: ['eastern-quarry'] })
    let response = session.takeAction(0, 'eastern-quarry')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(card)
    response = accept(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 3, vegetable: 1, food: 0 })
    expect(response.state.actionSpaces.find(space => space.id === 'vegetable-seeds')!.takenBy).toHaveLength(1)
    expectAfter(response)
    response = accept(session, response)
    expect(response.state.players[0]!.resources.reed).toBe(1)
  }, 30_000)
})

describe('Tag-Along timing', () => {
  it('finishes the opponent-triggered use before the owner ordinary after window', () => {
    const card = 'B178_TagAlong'
    const session = setup({ cards: [card], playerCount: 5, actor: 1 })
    companion(session, { actionSpaces: ['resource-market-56'] }, 'opponent')
    let response = session.takeAction(1, 'resource-market-56')
    for (let step = 0; step < 3 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch'; step++) {
      response = choose(session, response, 'confirm')
    }
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(card)
    response = accept(session, response)
    for (let step = 0; step < 3 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch'; step++) {
      response = choose(session, response, 'confirm')
    }
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, wood: 1, stone: 1 })
    expect(response.state.players[1]!.resources).toMatchObject({ reed: 1, wood: 1, stone: 1 })
    expect(response.state.actionSpaces.find(space => space.id === 'resource-market-56')!.takenBy).toHaveLength(2)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).toBe(AFTER)
    response = accept(session, response)
    expect(response.state.players[0]!.resources.reed).toBe(2)
  }, 30_000)
})

describe('Fast Mason timing', () => {
  it('renovates from the collected clay before ordinary after reactions', () => {
    const card = 'C169_FastMason'
    const session = setup({ cards: [card], playerCount: 5, configure: state => {
      state.players[0]!.houseType = 'wood'
      state.actionSpaces.find(space => space.id === 'hollow-56')!.resources.clay = 3
    } })
    companion(session, { actionSpaces: ['hollow-56'] })
    let response = session.takeAction(0, 'hollow-56')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(card)
    expect(response.state.players[0]!.resources.clay).toBe(3)
    response = accept(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, reed: 0 })
    expect(response.state.players[0]!.houseType).toBe('clay')
    expectAfter(response)
  }, 30_000)
})

describe('Village Teacher timing', () => {
  it('grants the occupied-Lessons reward before ordinary after reactions', () => {
    const card = 'C175_VillageTeacher'
    const target = 'A100_Curator'
    const session = setup({ cards: [card], playerCount: 5, configure: state => {
      state.players[0]!.resources.food = 1
      state.players[0]!.occupationHand = [target]
    } })
    companion(session, { actionSpaces: ['lessons'] })
    let response = session.takeAction(0, 'lessons')
    if (options(response).some(option => option.value === target)) response = choose(session, response, target)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(target)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expectAfter(response)
  }, 30_000)
})

describe('Mountain Hiker timing', () => {
  it('buys stone before ordinary extension-space after reactions', () => {
    const card = 'C177_MountainHiker'
    const session = setup({ cards: [card], playerCount: 5, configure: state => {
      state.players[0]!.resources.food = 1
      state.actionSpaces.find(space => space.id === 'hollow-56')!.resources.clay = 3
    } })
    companion(session, { actionSpaces: ['hollow-56'] })
    let response = session.takeAction(0, 'hollow-56')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(card)
    response = accept(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, stone: 1, food: 0 })
    expectAfter(response)
  }, 30_000)
})

describe('Agricultural Implement timing', () => {
  it('performs the face-up special-card action before ordinary Farmland after reactions', () => {
    const card = 'M054_AgriculturalImplement'
    const session = setup({ cards: [card], moor: true, configure: state => {
      state.players[0]!.farmTerrain = [{ row: 1, col: 0, kind: 'moor' }]
    } })
    companion(session, { actionSpaces: ['farmland'] })
    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(card)
    response = accept(session, response)
    const specialCard = session.state.farmersOfTheMoor!.specialActionCards.find(entry => entry.actions.includes('cut-peat'))!
    const value = ['card-action', specialCard.id, 'action', 'cut-peat', 1, 0].join(':')
    response = choose(session, response, value)
    expect(response.state.farmersOfTheMoor!.specialActionCards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: specialCard.id, location: { kind: 'playerFaceUp', playerId: response.state.players[0]!.id } }),
    ]))
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.farmTerrain).toEqual([])
    expect(response.state.players[0]!.resources.fuel).toBe(3)
    expectAfter(response)
  }, 30_000)
})

function familySession(cards: string[]) {
  return setup({ cards, moor: true, configure: state => {
    state.roundActionOrder[4] = 'wish-children'
    const player = state.players[0]!
    player.rooms = 3
    player.roomTiles = [{ row: 2, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 1 }]
    player.farmTerrain = [{ row: 0, col: 1, kind: 'forest' }]
  } })
}

describe('Birthing House timing', () => {
  it('grants its family-growth rewards before ordinary after reactions', () => {
    const card = 'M089_BirthingHouse'
    const session = familySession([card])
    companion(session, { actions: ['family-growth'] })
    const response = session.takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ fuel: 1, food: 1 })
    expect(response.state.players[0]!.cardStates[card]?.counters?.bonusVp).toBe(1)
    expectAfter(response)
  }, 30_000)
})

describe('Forest Kindergarten timing', () => {
  it('grants forest food before ordinary family-growth after reactions', () => {
    const session = familySession(['M103_ForestKindergarten'])
    companion(session, { actions: ['family-growth'] })
    const response = session.takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expectAfter(response)
  }, 30_000)
})

describe('simultaneous immediate family-growth sources', () => {
  it.each([
    ['M089_BirthingHouse', 'M103_ForestKindergarten'],
    ['M103_ForestKindergarten', 'M089_BirthingHouse'],
  ])('lets the player choose %s then %s before ordinary after', (first, second) => {
    const session = familySession(['M089_BirthingHouse', 'M103_ForestKindergarten'])
    companion(session, { actions: ['family-growth'] })
    let response = session.takeAction(0, 'wish-children')
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind, JSON.stringify(response.interaction)).toBe('select-trigger')
    expect(options(response).filter(option => option.value !== '__pass__').map(option => option.sourceCard)).toEqual(expect.arrayContaining([first, second]))
    expect(options(response).some(option => option.sourceCard === AFTER)).toBe(false)
    expect(options(response).find(option => option.value === '__pass__')?.disabled).toBe(true)
    for (const card of [first, second]) {
      const selected = options(response).find(option => option.sourceCard === card)
      expect(selected, JSON.stringify(response.interaction)).toBeDefined()
      response = choose(session, response, selected!.value)
    }
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, fuel: 1 })
    expect(response.state.players[0]!.cardStates.M089_BirthingHouse?.counters?.bonusVp).toBe(1)
    expectAfter(response)
    response = accept(session, response)
    const moved = response.state.events.filter(event => event.type === 'resource.moved').map(event => event.sourceCardId)
    expect(moved.indexOf(first)).toBeGreaterThanOrEqual(0)
    expect(moved.indexOf(second)).toBeGreaterThan(moved.indexOf(first))
    expect(moved.indexOf(AFTER)).toBeGreaterThan(moved.indexOf(second))
  }, 30_000)
})

describe('Sidekick placement-only boundary', () => {
  it('does not start a chain after a workerless use', () => {
    const card = 'A171_Sidekick'
    const grant = 'TEST_1335_Grant'
    const session = setup({ cards: [card], playerCount: 5, configure: state => {
      state.roundActionOrder[0] = 'vegetable-seeds'
      state.roundActionOrder[1] = 'eastern-quarry'
      state.players[0]!.resources.food = 2
      state.players[0]!.minorPlayed = [grant]
      state.actionSpaces.find(space => space.id === 'eastern-quarry')!.resources.stone = 3
    } })
    session.withCtx(() => requireActiveCardRegistry('sidekick-workerless-test').registerListener({
      id: grant, cardIds: [grant], actions: ['anytime'], phases: ['anytime'],
      handler: () => ({ sourceCard: grant, flow: {
        type: 'leaf', actionId: 'eastern-quarry', expandFlow: true, spaceUse: { newPlacement: false },
        actionContext: { targetSpaceId: 'eastern-quarry' }, sourceCard: grant,
      } }),
    }))
    const response = session.takeAnytimeAction(0, grant)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, stone: 3, vegetable: 0 })
    expect(response.state.actionSpaces.find(space => space.id === 'vegetable-seeds')!.takenBy).toHaveLength(0)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).not.toBe(card)
    expect(options(response).some(option => option.sourceCard === card)).toBe(false)
  }, 30_000)
})
