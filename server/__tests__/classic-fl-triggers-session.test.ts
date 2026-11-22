import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { flCard, flSession, flOptions, chooseBranch, takeFlAnytime, confirmTurns } from './_helpers/classic-fl'
import { playImprovement, playOccupation, choose, bonusScore } from './_helpers/card-play-lifecycle'
import { createWorkSession } from './_helpers/session-fixtures'
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
