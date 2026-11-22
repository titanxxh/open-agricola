import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { CFL005_Brabant } from '../../shared/cards/classic/CFL/CFL005_Brabant'
import { CFL012_Cart } from '../../shared/cards/classic/CFL/CFL012_Cart'
import { CFL018_Oce } from '../../shared/cards/classic/CFL/CFL018_Oce'
import { CFL030_WildBoarHunt } from '../../shared/cards/classic/CFL/CFL030_WildBoarHunt'
import { CFL033_Sculptor } from '../../shared/cards/classic/CFL/CFL033_Sculptor'
import { CFL041_FryCook } from '../../shared/cards/classic/CFL/CFL041_FryCook'
import { CFL048_Botanist } from '../../shared/cards/classic/CFL/CFL048_Botanist'
import { CFL061_BlacklegChicken } from '../../shared/cards/classic/CFL/CFL061_BlacklegChicken'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { computeHarvestFeedingRequirement } from '../../shared/actions/helpers/harvest-feeding-requirement'
import { confirmTurns, flOptions, flSession } from './_helpers/classic-fl'
import { choose, playImprovement, bonusScore } from './_helpers/card-play-lifecycle'
import { createWorkSession } from './_helpers/session-fixtures'
import { resolveNonSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'
import { GameSession } from '../game/authoritative-session'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

// All cases use a deterministic four-player Work fixture; irrelevant hands are
// fixed before Session construction. Each test supplies its played cards and goods.
function setup(configure: (state: GameState) => void) {
  const session = flSession(configure)
  sessions.push(session)
  return session
}

describe('FL: resource triggers, restrictions, and scoring', () => {
  it.each([
    ['clay-pit', 1],
    ['forest', 0],
  ] as const)('Sculptor: %s grants %i extra food after collecting', (spaceId, reward) => {
    const session = setup((state) => {
      state.players[0]!.occupationPlayed = [CFL033_Sculptor.id]
      state.players[0]!.resources.food = 3
    })
    const response = session.takeAction(0, spaceId)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(3 + reward)
    const gains = response.state.events.filter(
      (event) => event.type === 'resource.moved' && event.sourceCardId === CFL033_Sculptor.id,
    )
    expect(gains).toHaveLength(reward)
    if (reward)
      expect(
        response.state.log.some((entry) =>
          JSON.stringify(entry.params).includes(CFL033_Sculptor.id),
        ),
      ).toBe(true)
  })

  it.each([2, 3, 4])(
    'Botanist: another player taking %i wood grants food only for exactly three',
    (wood) => {
      const session = setup((state) => {
        state.players[0]!.occupationPlayed = [CFL048_Botanist.id]
        state.players[0]!.resources.food = 5
        state.currentPlayerIndex = 1
        state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = wood
      })
      const response = session.takeAction(1, 'forest')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.food).toBe(wood === 3 ? 6 : 5)
      expect(response.state.players[1]!.resources.wood).toBe(wood)
    },
  )

  it.each([false, true])(
    'Cart: an opponent can use six wood with a later person only (%s)',
    (laterPerson) => {
      const session = setup((state) => {
        state.players[0]!.minorPlayed = [CFL012_Cart.id]
        state.currentPlayerIndex = 1
        state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 6
        if (laterPerson) {
          const player = state.players[1]!
          const worker = player.workers.find((entry) => entry.isActive)!
          state.actionSpaces
            .find((space) => space.id === 'copse')!
            .takenBy.push({ playerId: player.id, workerId: worker.id })
          recordRoundPlacement(player, 'copse', worker.id)
        }
      })
      const response = session.takeAction(1, 'forest')
      expect(response.ok).toBe(laterPerson)
      expect(response.state.players[1]!.resources.wood).toBe(laterPerson ? 6 : 0)
      expect(
        response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood,
      ).toBe(laterPerson ? 0 : 6)
    },
  )

  it.each([
    { cardId: CFL012_Cart.id, target: 'forest', archwayFirst: true, allowed: false },
    { cardId: CFL012_Cart.id, target: 'forest', archwayFirst: false, allowed: true },
    { cardId: CFL030_WildBoarHunt.id, target: 'pig-market', archwayFirst: true, allowed: true },
    { cardId: CFL030_WildBoarHunt.id, target: 'pig-market', archwayFirst: false, allowed: false },
  ])('$cardId: Archway preserves the original placement ordinal (first=$archwayFirst)', ({
    cardId, target, archwayFirst, allowed,
  }) => {
    const archway = 'D051_Archway'
    const session = createWorkSession({
      seed: 6051,
      options: { playerCount: 2 },
      configure: (state) => {
        state.round = 10
        state.currentPlayerIndex = 1
        state.players.forEach((player) => { player.resources.food = 20 })
        state.players[0]!.minorPlayed = [archway, cardId]
        state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 6
        state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 1
        const pigMarketSlot = state.roundActionOrder.indexOf('pig-market')
        if (pigMarketSlot >= state.round)
          [state.roundActionOrder[pigMarketSlot], state.roundActionOrder[0]] = [state.roundActionOrder[0]!, 'pig-market']
      },
    })
    sessions.push(session)
    confirmTurns(session, session.takeAction(1, archwayFirst ? archway : 'grain-seeds'))
    confirmTurns(session, session.takeAction(0, 'day-laborer'))
    confirmTurns(session, session.takeAction(1, archwayFirst ? 'grain-seeds' : archway))
    let response = confirmTurns(session, session.takeAction(0, 'clay-pit'))
    response = resolveTriggerIfPresent(session, response, archway)
    response = resolveNonSkipChoice(session, response)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 1, promptKey: 'ui.interactionMoveFarmerToSpace',
    })
    const worker = response.state.actionSpaces.find((space) => space.id === archway)!.takenBy[0]!
    expect(flOptions(response).some((option) => option.value === target)).toBe(allowed)

    if (!allowed) {
      const rejected = session.resolveChoice(1, target)
      expect(rejected.ok).toBe(false)
      expect(rejected.state.actionSpaces.find((space) => space.id === archway)!.takenBy).toEqual([worker])
      response = choose(session, response, 'fishing')
    } else {
      response = choose(session, response, target)
    }
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'worker.placed', viaCardId: archway, workerId: worker.workerId, spaceId: allowed ? target : 'fishing',
    }))
    expect(response.state.players[1]!.resources).toMatchObject({
      wood: allowed && target === 'forest' ? 6 : 0,
      boar: allowed && target === 'pig-market' ? 1 : 0,
    })
  })

  it('Blackleg Chicken: pays two food once, stores it, and cannot withdraw exhausted food', () => {
    const session = setup((state) => {
      state.players[0]!.minorHand = [CFL061_BlacklegChicken.id]
      state.players[0]!.resources.food = 5
    })
    let response = playImprovement(session, CFL061_BlacklegChicken.id, 'meeting-place')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.players[0]!.cardStates[CFL061_BlacklegChicken.id]?.counters?.food).toBe(2)
    const action = `${CFL061_BlacklegChicken.id}-withdraw`
    for (const food of [4, 5]) {
      response = session.takeAnytimeAction(0, action)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.food).toBe(food)
    }
    expect(response.interaction.anytimeActions.some((entry) => entry.id === action)).toBe(false)
    expect(session.takeAnytimeAction(0, action).ok).toBe(false)
  })

  it('Office: exchanges one clay for one stone without touching unrelated goods', () => {
    const session = setup((state) => {
      state.players[0]!.minorPlayed = [CFL018_Oce.id]
      Object.assign(state.players[0]!.resources, { clay: 2, grain: 3 })
    })
    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice')
      throw new Error('Expected exchange choices')
    const option = response.interaction.request.options.find(
      (entry) =>
        entry.sourceCard === CFL018_Oce.id &&
        entry.effectPreview?.kind === 'resourceExchange' &&
        (entry.effectPreview.resourcesGained?.stone ?? 0) > 0,
    )
    expect(option, JSON.stringify(response.interaction.request.options)).toBeDefined()
    response = session.resolveChoice(0, `bulk:${option!.value.split(':')[1]}=1`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      clay: 1,
      stone: 1,
      grain: 3,
      vegetable: 0,
    })
    expect(
      response.state.events.some(
        (event) => event.type === 'resource.exchanged' && event.exchangeSource === CFL018_Oce.id,
      ),
    ).toBe(true)
  })

  it.each([0, 1, 2, 3])('Brabant: scoring with %i animal species', (species) => {
    const session = setup((state) => {
      state.players[0]!.minorPlayed = [CFL005_Brabant.id]
      for (const animal of (['sheep', 'boar', 'cattle'] as const).slice(0, species))
        state.players[0]!.resources[animal] = 1
    })
    const response = session.getState()
    const animalScores = response.scores![0]!.categories.filter((category) =>
      ['sheeps', 'boars', 'cattles'].includes(category.key),
    )
    expect(animalScores).toHaveLength(3)
    const absent = animalScores.filter((category) => category.quantity === 0)
    expect(absent).toHaveLength(3 - species)
    expect(
      absent.every((category) => category.total === -1),
      JSON.stringify(absent),
    ).toBe(true)
    expect(bonusScore(response, CFL005_Brabant.id)).toBe(species <= 1 ? 5 : 0)
  })

  it.each([2, 3, 4, 5])('Fry Cook: %i adults receive the exact feeding adjustment', (adults) => {
    const session = setup((state) => {
      const player = state.players[0]!
      player.occupationPlayed = [CFL041_FryCook.id]
      player.workers.forEach((worker, index) => {
        worker.isActive = index < adults
      })
    })
    expect(
      session.withCtx(() =>
        computeHarvestFeedingRequirement(session.state, session.state.players[0]!),
      ),
    ).toBe(adults * 2 - 2 + Math.max(0, adults - 2))
  })
})
