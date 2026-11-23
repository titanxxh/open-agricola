import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { flCard, flSession, flOptions, chooseBranch, takeFlAnytime, confirmTurns } from './_helpers/classic-fl'
import { playImprovement, playOccupation, choose, bonusScore } from './_helpers/card-play-lifecycle'
import { createWorkSession as createFixtureWorkSession } from './_helpers/session-fixtures'
import { orderReactionsManually, withManualReactionOrder } from './_helpers/trigger-select'

// These scenarios choose every reaction order themselves (#2039: auto-resolve off).
const createWorkSession = (options: Parameters<typeof createFixtureWorkSession>[0] = {}) =>
  createFixtureWorkSession(withManualReactionOrder(options))
import { resolveNonSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { computeHarvestFeedingRequirement } from '../../shared/actions/helpers/harvest-feeding-requirement'
import { getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'

const sessions: GameSession[] = []
const keep = (session: GameSession) => {
  sessions.push(session)
  return session
}
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))
function accept(session: GameSession, response: SessionResponse): SessionResponse {
  for (let i = 0; i < 8; i++) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') return response
    if (response.interaction.request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
      continue
    }
    if (response.interaction.request.kind !== 'choice') return response
    response = chooseBranch(session, response)
  }
  throw new Error('Unexpected choice loop')
}

function northSeaFishermanSession(fishingFood: number, revealedThisRound: boolean): GameSession {
  return keep(createWorkSession({
    seed: 6100,
    options: { playerCount: 2 },
    configure: (state) => {
      state.round = 2
      state.availableMajorImprovements = []
      const owner = state.players[0]!
      owner.occupationPlayed = [flCard(51).id]
      owner.minorHand = [flCard(61).id]
      owner.resources.food = 0
      state.players[1]!.resources.food = 3
      const roundIndex = revealedThisRound ? 1 : 0
      const oldIndex = state.roundActionOrder.indexOf('major-improvement')
      state.roundActionOrder[oldIndex] = state.roundActionOrder[roundIndex]!
      state.roundActionOrder[roundIndex] = 'major-improvement'
      state.actionSpaces.find((space) => space.id === 'major-improvement')!.roundAvailable = roundIndex + 1
      state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = fishingFood
    },
  }))
}

describe('FL: individual card triggers and exclusions', () => {
  it('Belgian Shepherd: offers unused-space sheep housing and blocks house pets', () => {
    const session = keep(
      flSession((state) => {
        state.players[0]!.minorPlayed = [flCard(3).id]
      }),
    )
    const zones = session.withCtx(() =>
      computeAnimalZones(session.state.players[0]!, session.state),
    )
    expect(
      zones
        .filter((zone) => zone.zoneType === 'house')
        .every((zone) => zone.capacity === 0 || zone.blocked),
    ).toBe(true)
    const fieldZones = zones.filter((zone) => zone.cardId === flCard(3).id)
    expect(fieldZones).toHaveLength(13)
    expect(
      fieldZones.every(
        (zone) =>
          zone.capacity === 2 && zone.occupiedZoneLimit === 1 && zone.countsFarmyardSpaceAsUnused,
      ),
    ).toBe(true)
  })

  it.each(['wood', 'stone'] as const)(
    'Courtyard Garden: adjacent unused spaces score only for a %s house',
    (houseType) => {
      const session = keep(
        flSession((state) => {
          state.players[0]!.minorPlayed = [flCard(15).id]
          state.players[0]!.houseType = houseType
        }),
      )
      expect(bonusScore(session.getState(), flCard(15).id)).toBe(houseType === 'stone' ? 6 : 0)
    },
  )

  it('Hash with Fries: pays all three goods, scores, and passes to the next hand', () => {
    const session = keep(
      flSession((state) => {
        state.players[0]!.minorHand = [flCard(28).id]
        Object.assign(state.players[0]!.resources, { grain: 1, vegetable: 1, cattle: 1, food: 2 })
        state.players[0]!.houseAnimals = { '1-0': 'cattle' }
      }),
    )
    const response = accept(session, session.takeAction(0, 'meeting-place'))
    expect(response.state.players[0]!.resources).toMatchObject({
      grain: 0,
      vegetable: 0,
      cattle: 0,
      food: 7,
    })
    expect(response.state.players[1]!.minorHand).toContain(flCard(28).id)
    expect(response.state.players[0]!.minorPlayed).not.toContain(flCard(28).id)
    expect(bonusScore(response, flCard(28).id)).toBe(3)
  })

  it('Shepherd with Flock: its owner-only action doubles sheep when there is enough unused land', () => {
    const session = keep(
      flSession((state) => {
        state.players[0]!.occupationPlayed = [flCard(38).id]
        state.players[0]!.resources.sheep = 2
        state.players[0]!.pastures = [
          {
            id: 'p',
            tiles: [
              { row: 0, col: 1 },
              { row: 0, col: 2 },
            ],
            animalType: 'sheep',
            animalCount: 2,
          },
        ]
      }),
    )
    const response = session.takeAction(0, flCard(38).id)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(4)
  })

  it('Rainmaker: a played improvement adds exactly one crop to the selected field', () => {
    const session = keep(
      flSession((state) => {
        state.players[0]!.occupationPlayed = [flCard(42).id]
        state.players[0]!.minorHand = [flCard(18).id]
        Object.assign(state.players[0]!.resources, { wood: 3, clay: 4, reed: 2 })
        state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }]
      }),
    )
    const response = accept(session, playImprovement(session, flCard(18).id, 'meeting-place'))
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it.each([false, true])(
    'Rubenesque Woman: bonus applies to the second family member=%s',
    (second) => {
      const session = keep(
        flSession((state) => {
          state.players[0]!.occupationPlayed = [flCard(43).id]
          if (second) recordRoundPlacement(state.players[0]!, 'day-laborer', '2')
        }),
      )
      const response = session.takeAction(0, 'forest')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.wood).toBe(second ? 4 : 3)
      expect(
        session.withCtx(() =>
          computeHarvestFeedingRequirement(session.state, session.state.players[0]!),
        ),
      ).toBe(5)
    },
  )

  it('Rubenesque Woman: the second person can use the bonus to pay Fishing Net', () => {
    const card = flCard(43).id
    const net = 'C051_FishingNet'
    const researcher = 'C154_TwinResearcher'
    const session = keep(flSession((state) => {
      orderReactionsManually(state)
      state.players[0]!.occupationPlayed = [card, researcher]
      state.players[1]!.minorPlayed = [net]
      state.players[0]!.resources.food = 1
      state.players[1]!.resources.food = 0
      state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 2
      state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food = 2
    }))
    confirmTurns(session, session.takeAction(0, 'grain-seeds'))
    confirmTurns(session, session.takeAction(1, 'forest'))
    confirmTurns(session, session.takeAction(2, 'reed-bank'))
    confirmTurns(session, session.takeAction(3, 'clay-pit'))

    const offered = session.takeAction(0, 'fishing')
    expect(offered.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0,
      request: { kind: 'select-trigger', options: expect.arrayContaining([
        expect.objectContaining({ sourceCard: researcher }),
        expect.objectContaining({ sourceCard: card }),
      ]) },
    })
    const pointOffer = resolveTriggerIfPresent(session, offered, researcher)
    expect(pointOffer.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: researcher })
    // After the point, the remaining sources are each the last mandatory one in turn:
    // the bonus and the Fishing Net fee settle without further choices.
    const response = chooseBranch(session, pointOffer)

    const actor = response.state.players[0]!
    const owner = response.state.players[1]!
    expect(response.state.actionSpaces.find((space) => space.id === 'fishing')?.resources.food).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'traveling-players')?.resources.food).toBe(2)
    expect(actor.resources.food).toBe(2)
    expect(owner.resources.food).toBe(1)
    expect(bonusScore(response, researcher)).toBe(1)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })

    const { events } = response.state
    const pointPayment = events.find((event) =>
      event.type === 'resource.paid' && event.sourceCardId === researcher && event.resources.food === 1,
    )
    const bonus = events.find((event) => event.type === 'resource.moved' && event.sourceCardId === card)
    const fee = events.find((event) => event.type === 'resource.moved' && event.sourceCardId === net)
    const collection = events.find((event) =>
      event.type === 'resource.moved' && event.from.kind === 'actionSpace' && event.from.spaceId === 'fishing',
    )
    expect(bonus).toMatchObject({ resources: { food: 1 }, to: { kind: 'player', playerId: actor.id } })
    expect(fee).toMatchObject({ resources: { food: 1 }, to: { kind: 'player', playerId: owner.id } })
    expect(collection).toMatchObject({ resources: { food: 2 }, to: { kind: 'player', playerId: actor.id } })
    expect(pointPayment!.seq).toBeLessThan(bonus!.seq)
    expect(bonus!.seq).toBeLessThan(fee!.seq)
    expect(fee!.seq).toBeLessThan(collection!.seq)
  })

  it.each([true, false])('Rubenesque Woman: a person relocated from Archway keeps their ordinal (first=%s)', (first) => {
    const card = flCard(43).id
    const archway = 'D051_Archway'
    const session = keep(createWorkSession({
      seed: 6051,
      options: { playerCount: 2 },
      configure: (state) => {
        state.round = 10
        state.currentPlayerIndex = 1
        state.players[0]!.minorPlayed = [archway]
        state.players[1]!.occupationPlayed = [card]
        for (const player of state.players) player.resources.food = 20
        state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
      },
    }))
    confirmTurns(session, session.takeAction(1, first ? archway : 'grain-seeds'))
    confirmTurns(session, session.takeAction(0, 'day-laborer'))
    confirmTurns(session, session.takeAction(1, first ? 'grain-seeds' : archway))
    let response = confirmTurns(session, session.takeAction(0, 'clay-pit'))
    response = resolveTriggerIfPresent(session, response, archway)
    response = resolveNonSkipChoice(session, response)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 1, promptKey: 'ui.interactionMoveFarmerToSpace',
    })
    const workerId = response.state.actionSpaces.find((space) => space.id === archway)!.takenBy[0]!.workerId
    response = choose(session, response, 'forest')
    expect(response.state.players[1]!.resources.wood).toBe(first ? 3 : 4)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'worker.placed', viaCardId: archway, workerId, spaceId: 'forest',
    }))
    expect(response.state.events.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === card && event.resources.wood === 1,
    )).toHaveLength(first ? 0 : 1)
  })

  it.each([0, 1])('Returnee: player %i uses the marked space next round', (actor) => {
    const session = keep(
      flSession((state) => {
        state.round = 2
        state.currentPlayerIndex = actor
        state.players[0]!.occupationPlayed = [flCard(44).id]
        state.players[0]!.cardStates[flCard(44).id] = {
          extraData: {
            dueRound: 2,
            actionSpaceAttachments: [{ spaceId: 'forest', resources: { grain: 1 } }],
          },
        }
      }),
    )
    const response = session.takeAction(actor, 'forest')
    expect(response.state.players[0]!.resources.grain).toBe(actor === 0 ? 1 : 0)
    expect(
      response.state.players[0]!.cardStates[flCard(44).id]?.extraData?.actionSpaceAttachments,
    ).toEqual([])
  })

  it('Stable Architect: scores only unfenced stables', () => {
    const session = keep(
      flSession((state) => {
        state.players[0]!.occupationPlayed = [flCard(46).id]
        state.players[0]!.stableTiles = [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ]
        state.players[0]!.pastures = [
          { id: 'p', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 },
        ]
      }),
    )
    expect(bonusScore(session.getState(), flCard(46).id)).toBe(1)
  })

  it.each([
    { opponentFood: 3, deck: ['A099_FellowGrazer'] },
    { opponentFood: 4, deck: [] },
  ])('Farm Lawyer: completes the free occupation without a valid transfer ($opponentFood food, deck $deck)', ({
    opponentFood, deck,
  }) => {
    const cardId = flCard(47).id
    const session = keep(
      createWorkSession({
        seed: 6100,
        configure: (state) => {
          state.players[0]!.occupationHand = [cardId]
          state.players[0]!.resources.food = 3
          state.players[1]!.resources.food = opponentFood
          state.ordinaryCardDecks.occupation = [...deck]
        },
      }),
    )
    const before = session.getState()
    const response = confirmTurns(session, playOccupation(session, cardId))
    expect(response.interaction).toMatchObject({
      stateId: 'idle',
      allowedCommands: expect.arrayContaining(['takeAction']),
    })
    expect(response.state.currentPlayerIndex).toBe(1)
    expect(response.state.players[0]!.occupationPlayed).toEqual([cardId])
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.players[1]!.resources.food).toBe(opponentFood)
    expect(response.state.players[1]!.occupationHand).toEqual(before.state.players[1]!.occupationHand)
    expect(response.state.players[0]!.extraOccupationsFromCards).toEqual([])
    expect(response.state.players[0]!.cardStates[cardId]?.extraData?.faceDownOccupations).toBeUndefined()
    expect(response.state.ordinaryCardDecks.occupation).toEqual(deck)
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.playOccupation',
      params: expect.objectContaining({ occupations: cardId, costResources: {} }),
    }))
    expect(response.state.log).not.toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId }),
    }))
    expect(bonusScore(response, cardId)).toBe(0)
  })

  it('Farm Lawyer: qualifies the opponent after payment, transfers itself, and draws a face-down occupation', () => {
    const cardId = flCard(47).id
    const session = keep(
      createWorkSession({
        seed: 6100,
        configure: (state) => {
          state.players[0]!.occupationPlayed = ['A098_StableArchitect']
          state.players[0]!.occupationHand = [cardId]
          state.players[0]!.resources.food = 3
          state.players[1]!.resources.food = 3
          state.ordinaryCardDecks.occupation = ['A099_FellowGrazer']
        },
      }),
    )
    const response = confirmTurns(session, playOccupation(session, cardId))
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.currentPlayerIndex).toBe(1)
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.playOccupation',
      params: expect.objectContaining({ occupations: cardId, costResources: { food: 1 } }),
    }))
    expect(response.state.players.map((player) => player.resources.food)).toEqual([3, 3])
    expect(response.state.players[0]!.occupationPlayed).toEqual(['A098_StableArchitect'])
    expect(response.state.players[1]!.occupationHand).toContain(cardId)
    expect(response.state.players[0]!.extraOccupationsFromCards).toHaveLength(1)
    expect(response.state.players[0]!.extraOccupationsFromCards[0]).not.toContain('A099_FellowGrazer')
    expect(response.state.ordinaryCardDecks.occupation).toEqual([])
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId, gain: { food: 1 } }),
    }))
    expect(bonusScore(response, cardId)).toBe(0)
  })

  it('Farm Lawyer: lets the player choose between opponents with more food', () => {
    const cardId = flCard(47).id
    const session = keep(
      flSession((state) => {
        state.players[0]!.occupationHand = [cardId]
        state.players[0]!.resources.food = 1
        state.players[1]!.resources.food = 7
        state.players[2]!.resources.food = 4
        state.players[3]!.resources.food = 1
        state.ordinaryCardDecks.occupation = ['A099_FellowGrazer']
      }),
    )
    let response = playOccupation(session, cardId)
    expect(flOptions(response).map(({ value }) => value)).toEqual([
      response.state.players[1]!.id,
      response.state.players[2]!.id,
    ])
    response = choose(session, response, response.state.players[1]!.id)
    expect(response.state.players[0]!.resources.food).toBe(7)
    expect(response.state.players[1]!.occupationHand).toContain(cardId)
    expect(response.state.players[2]!.occupationHand).not.toContain(cardId)
  })

  it('North Sea Fisherman: another player on Fishing receives the additional food', () => {
    const session = keep(
      flSession((state) => {
        state.currentPlayerIndex = 1
        state.players[0]!.occupationPlayed = [flCard(51).id]
        state.players.forEach((player) => {
          player.resources.food = 0
        })
      }),
    )
    const response = session.takeAction(1, 'fishing')
    expect(response.state.players.map((player) => player.resources.food)).toEqual([0, 2, 0, 0])
  })

  it('North Sea Fisherman: an opponent can use the bonus to pay Fishing Net before collecting', () => {
    const fisherman = flCard(51).id
    const net = 'C051_FishingNet'
    const researcher = 'C154_TwinResearcher'
    const session = keep(flSession((state) => {
      orderReactionsManually(state)
      const actor = state.players[0]!
      const owner = state.players[1]!
      actor.occupationPlayed = [researcher]
      owner.occupationPlayed = [fisherman]
      owner.minorPlayed = [net]
      for (const player of state.players) player.resources.food = player.id === actor.id ? 1 : 0
      state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 2
      state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food = 2
    }))

    const offer = session.takeAction(0, 'fishing')
    expect(offer.ok, offer.error).toBe(true)
    expect(offer.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: researcher })
    expect(offer.state.players[0]!.resources.food).toBe(1)
    const beforeDonation = accept(session, chooseBranch(session, offer))
    expect(beforeDonation.state.players[0]!.resources.food).toBe(0)
    expect(beforeDonation.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 1,
      request: { kind: 'select-trigger', options: expect.arrayContaining([
        expect.objectContaining({ sourceCard: fisherman }),
        expect.objectContaining({ sourceCard: net, disabled: true }),
      ]) },
    })
    // After the Fisherman's donation, the Fishing Net is the owner's last mandatory source and runs without asking.
    const response = accept(session, choose(session, beforeDonation, fisherman))

    const actor = response.state.players[0]!
    const owner = response.state.players[1]!
    expect(response.state.actionSpaces.find((space) => space.id === 'fishing')?.resources.food).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'traveling-players')?.resources.food).toBe(2)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([2, 1, 0, 0])
    expect(owner.cardStates[net]?.extraData?.pendingDeposits).toBe(1)
    expect(bonusScore(response, researcher)).toBe(1)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })

    const { events } = response.state
    const pointPayment = events.find((event) =>
      event.type === 'resource.paid' && event.sourceCardId === researcher && event.resources.food === 1,
    )
    const donation = events.find((event) => event.type === 'resource.moved' && event.sourceCardId === fisherman)
    const fee = events.find((event) => event.type === 'resource.moved' && event.sourceCardId === net)
    const collection = events.find((event) =>
      event.type === 'resource.moved' && event.from.kind === 'actionSpace' && event.from.spaceId === 'fishing',
    )
    expect(donation).toMatchObject({ resources: { food: 1 }, to: { kind: 'player', playerId: actor.id } })
    expect(fee).toMatchObject({
      resources: { food: 1 }, from: { kind: 'player', playerId: actor.id }, to: { kind: 'player', playerId: owner.id },
    })
    expect(collection).toMatchObject({ resources: { food: 2 }, to: { kind: 'player', playerId: actor.id } })
    expect(pointPayment!.seq).toBeLessThan(donation!.seq)
    expect(donation!.seq).toBeLessThan(fee!.seq)
    expect(fee!.seq).toBeLessThan(collection!.seq)
  })

  it('North Sea Fisherman: Fishing food pays for an improvement on the newly revealed space', () => {
    const session = northSeaFishermanSession(2, true)
    const fisherman = flCard(51).id
    const chicken = flCard(61).id
    const available = session.getActionAvailability(0)['major-improvement']
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    expect(available).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: fisherman })
    expect(offered.state.players[0]!.resources.food).toBe(0)
    expect(offered.state.players[0]!.minorHand).toContain(chicken)
    expect(offered.state.actionSpaces.find((space) => space.id === 'fishing')?.resources.food).toBe(2)

    const result = accept(session, chooseBranch(session, offered))
    expect(result.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(result.state.players.map((player) => player.resources.food)).toEqual([0, 3])
    expect(result.state.players[0]!.minorPlayed).toContain(chicken)
    expect(result.state.players[0]!.cardStates[chicken]?.counters?.food).toBe(2)
    expect(result.state.actionSpaces.find((space) => space.id === 'fishing')?.resources.food).toBe(0)
    const taken = result.state.events.find((event) =>
      event.type === 'resource.moved' && event.from.kind === 'actionSpace' &&
      event.from.spaceId === 'fishing' && event.resources.food === 2,
    )
    const paid = result.state.events.find((event) =>
      event.type === 'resource.paid' && event.resources.food === 2,
    )
    const played = result.state.events.find((event) => event.type === 'card.played' && event.cardId === chicken)
    expect(taken).toMatchObject({ reason: 'collect', to: { kind: 'player', playerId: result.state.players[0]!.id } })
    expect(played).toMatchObject({ payment: expect.objectContaining({ resources: { food: 2 } }) })
    expect(taken!.seq).toBeLessThan(paid!.seq)
    expect(paid!.seq).toBeLessThan(played!.seq)
    expect(result.state.log).toContainEqual(expect.objectContaining({
      key: 'log.playMinorImprovement',
      params: expect.objectContaining({ improvements: chicken, costResources: { food: 2 } }),
    }))
    expect(bonusScore(result, chicken)).toBe(0)
  })

  it.each([
    { label: 'Fishing is empty', fishingFood: 0, revealedThisRound: true },
    { label: 'Major Improvement was revealed earlier', fishingFood: 2, revealedThisRound: false },
  ])('North Sea Fisherman: cannot fund an improvement when $label', ({ fishingFood, revealedThisRound }) => {
    const session = northSeaFishermanSession(fishingFood, revealedThisRound)
    expect(session.getActionAvailability(0)['major-improvement']).toBe(false)
    const response = session.takeAction(0, 'major-improvement')
    expect(response.ok).toBe(false)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.minorHand).toContain(flCard(61).id)
    expect(response.state.actionSpaces.find((space) => space.id === 'fishing')?.resources.food).toBe(fishingFood)
    expect(response.state.actionSpaces.find((space) => space.id === 'major-improvement')?.takenBy).toEqual([])
  })

  it.each(['sheep', 'cattle'] as const)(
    'Cafe Singer exchanges a %s after Traveling Players',
    (animal) => {
      const session = keep(
        flSession((state) => {
          state.players[0]!.occupationPlayed = [flCard(53).id]
          state.players[0]!.resources[animal] = 1
          state.players[0]!.houseAnimals = { '1-0': animal }
        }),
      )
      const response = accept(session, session.takeAction(0, 'traveling-players'))
      expect(response.state.players[0]!.resources[animal]).toBe(0)
      expect(response.state.players[0]!.resources.vegetable).toBe(animal === 'sheep' ? 1 : 2)
    },
  )

  it('Chanson Singer: leaves four food on Traveling Players for four different building materials', () => {
    const session = keep(
      flSession((state) => {
        state.players[0]!.occupationPlayed = [flCard(54).id]
        state.players[0]!.resources.food = 0
        state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food = 4
      }),
    )
    let response = session.takeAction(0, 'traveling-players')
    response = chooseBranch(session, response, 3)
    response = accept(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0,
      wood: 1,
      clay: 1,
      reed: 1,
      stone: 1,
    })
    expect(
      response.state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food,
    ).toBe(4)
  })

  it('Virtuous Hero: reserves three fences and returns only the collecting opponent’s token', () => {
    const session = keep(
      flSession((state) => {
        state.players[0]!.occupationPlayed = [flCard(60).id]
        state.players[0]!.resources.food = 0
      }),
    )
    takeFlAnytime(session, 60, 'give-fences')
    expect(session.withCtx(() => getOwnOrdinaryFenceReserveCount(session.state.players[0]!))).toBe(
      12,
    )
    confirmTurns(session, session.takeAction(0, 'day-laborer'))
    const response = accept(session, session.takeAction(1, 'forest'))
    expect(response.state.players[1]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(session.withCtx(() => getOwnOrdinaryFenceReserveCount(session.state.players[0]!))).toBe(
      13,
    )
    expect(session.takeAnytimeAction(0, `${flCard(60).id}-give-fences`).ok).toBe(false)
  })
})
