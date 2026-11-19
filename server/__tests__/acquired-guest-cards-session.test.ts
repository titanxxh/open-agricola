import { afterEach, describe, expect, it } from 'vitest'
import { getEligibleClassicCardIds } from '../../shared/cards/classic-catalog'
import type { GameState } from '../../shared/contract/types'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { playImprovement } from './_helpers/card-play-lifecycle'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { getChoiceOptions } from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'
import { takeNormalWorkerTurn } from './_helpers/supply-worker-turn'
import { expectWait, resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'

const BAKERY = 'CFL026_SpeculoosBakery'
const COUNSELOR = 'CPI007_MarriageCounselor'
const FIREPLACE = 'Major_Fireplace1'
const CLAY_OVEN = 'Major_ClayOven'
const SOUR_DOUGH = 'E062_SourDough'
const THRESHING_BOARD = 'A024_ThreshingBoard'
const MONASTIC_VOWS = 'CNL017_MonasticVows'
const sessions: GameSession[] = []

afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup(playerCount: 2 | 4 | 6, configure: (state: GameState) => void) {
  const session = createWorkSession({ seed: 62, options: { playerCount }, configure(state) {
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    configure(state)
  } })
  sessions.push(session)
  return session
}

function setupBakery(grain: number, configure?: (state: GameState) => void, playerCount: 2 | 6 = 2) {
  const session = setup(playerCount, state => {
    state.round = 2
    const space = state.actionSpaces.find(space => space.id === 'grain-utilization')!
    space.roundAvailable = 1
    Object.assign(state.players[0]!.resources, { grain, food: 0, clay: 3, stone: 1 })
    state.players[0]!.improvements = [FIREPLACE]
    configure?.(state)
    state.players[0]!.minorPlayed.push(BAKERY)
  })
  return session
}

function choose(session: GameSession, response: SessionResponse, value: string) {
  const { interaction } = expectWait(response)
  const resolved = session.resolveChoice(interaction.playerIndex, value)
  expect(resolved.ok, resolved.error).toBe(true)
  return resolved
}

function bakeOne(session: GameSession, response: SessionResponse, recipe = FIREPLACE) {
  if (getChoiceOptions(response).some(option => option.labelKey === 'actions.bake-bread.name' || option.labelKey === 'actions.side-job-6.option-bake')) {
    const bake = getChoiceOptions(response).find(option => option.labelKey === 'actions.bake-bread.name' || option.labelKey === 'actions.side-job-6.option-bake')!
    response = choose(session, response, bake.value)
  }
  const { interaction } = expectWait(response)
  if (interaction.request.kind === 'confirm-next-player') return response
  if (interaction.promptKey === 'ui.interactionBakeBreadCount') return choose(session, response, `count-${recipe}-1`)
  expect(interaction.promptKey).toBe('ui.interactionBakeBreadChoice')
  return choose(session, response, `bulk:${recipe}=1`)
}

const grantedBy = (response: SessionResponse, cardId: string) => response.state.events.filter(event =>
  event.type === 'guest.granted' && event.cardId === cardId)

function guestPurchase(session: GameSession, response: SessionResponse, cardId: string) {
  const offer = resolveTriggerIfPresent(session, response, cardId)
  expect(expectWait(offer).interaction.sourceCard).toBe(cardId)
  return offer
}

describe('Speculoos Bakery', () => {
  it('plays from hand for two wood and two clay and scores one point', () => {
    const session = setup(2, state => {
      const owner = state.players[0]!
      owner.minorHand.unshift(BAKERY)
      Object.assign(owner.resources, { wood: 2, clay: 2 })
    })
    const played = playImprovement(session, BAKERY, 'meeting-place')
    const owner = played.state.players[0]!
    expect(owner.minorHand).not.toContain(BAKERY)
    expect(owner.minorPlayed).toContain(BAKERY)
    expect(owner.resources).toMatchObject({ wood: 0, clay: 0 })
    expect(played.state.events).toContainEqual(expect.objectContaining({
      type: 'card.played', cardId: BAKERY, payment: expect.objectContaining({ resources: { wood: 2, clay: 2 } }),
    }))
    expect(played.scores?.[0]?.categories.find(category => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: BAKERY, cardType: 'minor', score: 1 }))
  })

  it('lets the player pay one additional grain after baking on Grain Utilization, then dispatch the Guest', () => {
    const session = setupBakery(2)
    const baked = bakeOne(session, session.takeAction(0, 'grain-utilization'))
    expect(baked.state.players[0]!.resources).toMatchObject({ grain: 1, food: 2 })

    const offer = guestPurchase(session, baked, BAKERY)
    const granted = resolveNonSkipChoice(session, offer)
    expect(granted.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
    expect(grantedBy(granted, BAKERY)).toEqual([expect.objectContaining({ guestId: 'guest:1', targetRound: 2 })])

    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    const nextTurn = confirmNextPlayer(session)
    const dispatch = getChoiceOptions(nextTurn).find(option => option.labelParams?.guestCardId === BAKERY)
    expect(dispatch).toBeDefined()
    const targets = choose(session, nextTurn, dispatch!.value)
    const placed = choose(session, targets, 'forest')
    expect(placed.state.actionSpaces.find(space => space.id === 'forest')?.takenBy).toEqual([
      { playerId: placed.state.players[0]!.id, workerId: 'guest:1', guest: true },
    ])
  })

  it('can buy a second Guest in the same round after baking on Side Job', () => {
    const session = setupBakery(4, undefined, 6)
    const first = bakeOne(session, session.takeAction(0, 'grain-utilization'))
    const firstPurchase = resolveNonSkipChoice(session, guestPurchase(session, first, BAKERY))
    expect(grantedBy(firstPurchase, BAKERY)).toHaveLength(1)
    expect(confirmNextPlayer(session).ok).toBe(true)
    for (const [index, space] of ['forest', 'clay-pit', 'reed-bank', 'fishing', 'day-laborer'].entries()) {
      expect(session.takeAction(index + 1, space).ok).toBe(true)
      expect(confirmNextPlayer(session).ok).toBe(true)
    }

    const second = bakeOne(session, takeNormalWorkerTurn(session, 'side-job-6'))
    const both = resolveNonSkipChoice(session, guestPurchase(session, second, BAKERY))
    expect(both.state.players[0]!.resources).toMatchObject({ grain: 0, food: 4 })
    expect(grantedBy(both, BAKERY)).toEqual([
      expect.objectContaining({ guestId: 'guest:1', targetRound: 2 }),
      expect.objectContaining({ guestId: 'guest:2', targetRound: 2 }),
    ])
  })

  it('leaves the remaining grain when the player declines', () => {
    const session = setupBakery(2)
    const baked = bakeOne(session, session.takeAction(0, 'grain-utilization'))
    const declined = resolveSkipChoice(session, guestPurchase(session, baked, BAKERY))
    expect(declined.state.players[0]!.resources).toMatchObject({ grain: 1, food: 2 })
    expect(grantedBy(declined, BAKERY)).toEqual([])
    expect(expectWait(declined).interaction.request.kind).toBe('confirm-next-player')
  })

  it('offers no exchange after baking with the last grain', () => {
    const session = setupBakery(1)
    const baked = bakeOne(session, session.takeAction(0, 'grain-utilization'))
    expect(baked.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
    expect(grantedBy(baked, BAKERY)).toEqual([])
    expect(expectWait(baked).interaction.request.kind).toBe('confirm-next-player')
  })

  it('offers no exchange for a Bake Bread action granted by a card', () => {
    const session = setupBakery(2, state => { state.players[0]!.minorPlayed = [SOUR_DOUGH] })
    const fromCard = session.takeAnytimeAction(0, 'E62-sour-dough-anytime')
    expect(fromCard.ok, fromCard.error).toBe(true)
    const baked = bakeOne(session, fromCard)
    expect(baked.state.players[0]!.resources).toMatchObject({ grain: 1, food: 2 })
    expect(grantedBy(baked, BAKERY)).toEqual([])
    expect(expectWait(baked).interaction.request.kind).toBe('confirm-next-player')
  })

  it('offers the exchange after baking on the Summer Farmers Market printed with Bake Bread', () => {
    const session = new GameSession(352, undefined, { playerCount: 2, enableThroughTheSeasons: true } as never)
    sessions.push(session)
    const state = session.state
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    ;(state as GameState & { throughTheSeasons: unknown }).throughTheSeasons = { startSeason: 'summer', currentSeason: 'summer' }
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const owner = state.players[0]!
    owner.minorPlayed = [BAKERY]
    owner.improvements = [FIREPLACE]
    Object.assign(owner.resources, { grain: 2, food: 0 })
    expect(session.loadState(state).ok).toBe(true)

    let response = session.takeAction(0, 'season-summer-farmers-market')
    expect(response.ok, response.error).toBe(true)
    for (const label of ['actions.season-summer-farmers-market.option-bread-or-sell', 'actions.bake-bread.name']) {
      const option = getChoiceOptions(response).find(candidate => candidate.labelKey === label)
      expect(option, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(0, option!.value)
      expect(response.ok, response.error).toBe(true)
    }
    // The offer follows the Bake Bread action itself, before the space's remaining Plow option.
    const offer = guestPurchase(session, choose(session, response, `bulk:${FIREPLACE}=1`), BAKERY)
    const granted = resolveNonSkipChoice(session, offer)
    expect(granted.state.players[0]!.resources.grain).toBe(0)
    expect(grantedBy(granted, BAKERY)).toEqual([expect.objectContaining({ guestId: 'guest:1', targetRound: 1 })])
  })

  it('offers no exchange for a Bake Bread action a card grants during an action space use', () => {
    const session = setupBakery(2, state => {
      state.players[0]!.minorPlayed = [THRESHING_BOARD]
    })
    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    const fromCard = resolveTriggerIfPresent(session, response, THRESHING_BOARD)
    expect(expectWait(fromCard).interaction.sourceCard).toBe(THRESHING_BOARD)
    response = bakeOne(session, resolveNonSkipChoice(session, fromCard))
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 2 })
    expect(expectWait(response).interaction.sourceCard).not.toBe(BAKERY)
    expect(grantedBy(response, BAKERY)).toEqual([])
  })

  it('offers the exchange when a Monastic Vows Guest bakes on Grain Utilization', () => {
    const session = setupBakery(2, state => {
      state.players[0]!.minorPlayed = [MONASTIC_VOWS]
      for (const player of state.players) setActiveWorkerCount(player, 1)
    })
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    const window = confirmNextPlayer(session)
    // The work-end window: A accepts Monastic Vows and places its Guest on Grain Utilization at once.
    const vows = getChoiceOptions(window).find(option => option.sourceCard === MONASTIC_VOWS)
    expect(vows, JSON.stringify(window.interaction)).toBeDefined()
    const targets = choose(session, window, vows!.value)
    expect(expectWait(targets).interaction.promptKey).toBe('ui.interactionPlaceFarmerExtra')
    const baked = bakeOne(session, choose(session, targets, 'grain-utilization'))
    expect(baked.state.players[0]!.resources).toMatchObject({ grain: 1, food: 5 })

    const offer = guestPurchase(session, baked, BAKERY)
    const granted = resolveNonSkipChoice(session, offer)
    expect(granted.state.players[0]!.resources.grain).toBe(0)
    expect(grantedBy(granted, BAKERY)).toEqual([expect.objectContaining({ targetRound: 2 })])
  })

  it('offers no exchange for the Bake Bread action included with buying an oven', () => {
    const session = setupBakery(2, state => {
      state.actionSpaces.find(space => space.id === 'major-improvement')!.roundAvailable = 1
    })
    const purchase = choose(session, session.takeAction(0, 'major-improvement'), CLAY_OVEN)
    expect(purchase.state.players[0]!.improvements).toContain(CLAY_OVEN)
    expect(expectWait(purchase).interaction.sourceCard).toBe(CLAY_OVEN)
    const baked = bakeOne(session, resolveNonSkipChoice(session, purchase), CLAY_OVEN)
    expect(baked.state.players[0]!.resources).toMatchObject({ grain: 1, food: 5 })
    expect(grantedBy(baked, BAKERY)).toEqual([])
    expect(expectWait(baked).interaction.request.kind).toBe('confirm-next-player')
  })
})

type Families = readonly [number, number, number, number]

function setupCounselor(families: Families, food: number, configure?: (state: GameState) => void) {
  const session = setup(4, state => {
    state.players.forEach((player, index) => {
      setActiveWorkerCount(player, families[index]!)
      markAllWorkersUsed(state, player)
    })
    state.players[0]!.resources.food = food
    state.players[0]!.occupationPlayed = [COUNSELOR]
    configure?.(state)
  })
  return session
}

describe('Marriage Counselor', () => {
  it('plays as the first occupation from the four-player Lessons space for one food', () => {
    const session = setup(4, state => {
      const owner = state.players[0]!
      owner.occupationHand.unshift(COUNSELOR)
      owner.resources.food = 1
    })
    const lessons = session.takeAction(0, 'lessons-4')
    expect(lessons.ok, lessons.error).toBe(true)
    const played = lessons.state.players[0]!.occupationHand.includes(COUNSELOR)
      ? choose(session, lessons, COUNSELOR)
      : lessons
    const owner = played.state.players[0]!
    expect(owner.occupationHand).not.toContain(COUNSELOR)
    expect(owner.occupationPlayed).toEqual([COUNSELOR])
    expect(owner.resources.food).toBe(0)
    expect(played.state.events).toContainEqual(expect.objectContaining({
      type: 'card.played', cardId: COUNSELOR, payment: expect.objectContaining({ resources: { food: 1 } }),
    }))
    expect(grantedBy(played, COUNSELOR)).toEqual([])
  })

  it('enters the classic occupation pool only with at least four players', () => {
    expect(getEligibleClassicCardIds(['CPI'], 2).occupation).not.toContain(COUNSELOR)
    expect(getEligibleClassicCardIds(['CPI'], 3).occupation).not.toContain(COUNSELOR)
    expect(getEligibleClassicCardIds(['CPI'], 4).occupation).toContain(COUNSELOR)
    expect(getEligibleClassicCardIds(['CPI'], 5).occupation).toContain(COUNSELOR)
    expect(getEligibleClassicCardIds(['CPI'], 6).occupation).toContain(COUNSELOR)
  })

  it('lets a family of two pay one food for a Guest at round start when another family has four', () => {
    const session = setupCounselor([2, 4, 2, 2], 2)
    const start = session.performRoundEnd()
    expect(start.state.round).toBe(2)

    const offer = guestPurchase(session, start, COUNSELOR)
    const granted = resolveNonSkipChoice(session, offer)
    expect(granted.state.players[0]!.resources.food).toBe(1)
    expect(grantedBy(granted, COUNSELOR)).toEqual([expect.objectContaining({ guestId: 'guest:1', targetRound: 2 })])
    expect(getChoiceOptions(granted).some(option => option.labelParams?.guestCardId === COUNSELOR)).toBe(true)
  })

  it('lets the only family of two with three families of three decline and keep its food', () => {
    const session = setupCounselor([2, 3, 3, 3], 1)
    const offer = guestPurchase(session, session.performRoundEnd(), COUNSELOR)
    const declined = resolveSkipChoice(session, offer)
    expect(declined.state.players[0]!.resources.food).toBe(1)
    expect(grantedBy(declined, COUNSELOR)).toEqual([])
    expect(declined.state.roundPhase).toBe('work')
    expect(declined.interaction.stateId).toBe('idle')
  })

  it('does not offer a Guest when the qualifying owner has no food', () => {
    const session = setupCounselor([2, 4, 2, 2], 0)
    const start = session.performRoundEnd()
    expect(start.ok, start.error).toBe(true)
    expect(start.state.round).toBe(2)
    expect(start.state.roundPhase).toBe('work')
    expect(start.interaction.stateId).toBe('idle')
    expect(grantedBy(start, COUNSELOR)).toEqual([])
  })

  it('excludes other players’ Guests when their families have three, three and four members', () => {
    const session = setupCounselor([3, 3, 3, 4], 2, state => {
      state.players[3]!.guests = [{ id: 'guest:1', round: 2, sourceCardId: BAKERY }]
    })
    const start = session.performRoundEnd()
    expect(start.ok, start.error).toBe(true)
    expect(start.state.round).toBe(2)
    expect(start.state.roundPhase).toBe('work')
    expect(start.interaction.stateId).toBe('idle')
    expect(grantedBy(start, COUNSELOR)).toEqual([])
  })

  it('charges at most once each round and offers again at the next round start', () => {
    const session = setupCounselor([2, 4, 2, 2], 2)
    const granted = resolveNonSkipChoice(session, guestPurchase(session, session.performRoundEnd(), COUNSELOR))
    const dispatch = getChoiceOptions(granted).find(option => option.labelParams?.guestCardId === COUNSELOR)
    expect(dispatch).toBeDefined()
    const placed = choose(session, choose(session, granted, dispatch!.value), 'forest')
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(grantedBy(placed, COUNSELOR)).toHaveLength(1)
    expect(placed.state.players[0]!.resources.food).toBe(1)

    const state = session.getState().state
    state.players.forEach(player => markAllWorkersUsed(state, player))
    expect(session.loadState(state).ok).toBe(true)
    const grantedAgain = resolveNonSkipChoice(session, guestPurchase(session, session.performRoundEnd(), COUNSELOR))
    expect(grantedAgain.state.players[0]!.resources.food).toBe(0)
    expect(grantedBy(grantedAgain, COUNSELOR)).toEqual([
      expect.objectContaining({ targetRound: 2 }),
      expect.objectContaining({ targetRound: 3 }),
    ])
  })
})
