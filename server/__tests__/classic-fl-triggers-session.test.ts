import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { fl, flSession, chooseBranch, takeFlAnytime, confirmTurns } from './_helpers/classic-fl'
import { playImprovement, playOccupation, choose, bonusScore } from './_helpers/card-play-lifecycle'
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
      flSession([3], (state) => {
        state.players[0]!.minorPlayed = [fl[3]!.id]
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
    const fieldZones = zones.filter((zone) => zone.cardId === fl[3]!.id)
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
        flSession([15], (state) => {
          state.players[0]!.minorPlayed = [fl[15]!.id]
          state.players[0]!.houseType = houseType
        }),
      )
      expect(bonusScore(session.getState(), fl[15]!.id)).toBe(houseType === 'stone' ? 6 : 0)
    },
  )

  it('Hash with Fries: pays all three goods, scores, and passes to the next hand', () => {
    const session = keep(
      flSession([28], (state) => {
        state.players[0]!.minorHand = [fl[28]!.id]
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
    expect(response.state.players[1]!.minorHand).toContain(fl[28]!.id)
    expect(response.state.players[0]!.minorPlayed).not.toContain(fl[28]!.id)
    expect(bonusScore(response, fl[28]!.id)).toBe(3)
  })

  it('Franciscan Monk: exchanges a minor for a hidden deck occupation and records the discard', () => {
    const session = keep(
      flSession([34, 18], (state) => {
        state.players[0]!.occupationPlayed = [fl[34]!.id]
        state.players[0]!.minorHand = [fl[18]!.id]
        state.ordinaryCardDecks.occupation = ['A099_FellowGrazer']
      }),
    )
    let response = takeFlAnytime(session, 34, 'exchange-hand')
    if (response.interaction.stateId === 'wait') response = choose(session, response, fl[18]!.id)
    expect(response.state.players[0]!.minorHand).toEqual([])
    expect(response.state.players[0]!.occupationHand).toContain('A099_FellowGrazer')
    expect(response.state.players[0]!.discardedHandCardCount).toBe(1)
    expect(response.state.ordinaryCardDecks.occupation).toEqual([])
  })

  it('Lantern Wonder prevents Franciscan Monk from discarding a hand card', () => {
    const session = keep(
      flSession([19, 34, 18], (state) => {
        state.players[0]!.occupationPlayed = [fl[34]!.id]
        state.players[0]!.minorPlayed = [fl[19]!.id]
        state.players[0]!.minorHand = [fl[18]!.id]
      }),
    )
    expect(session.takeAnytimeAction(0, `${fl[34]!.id}-exchange-hand`).ok).toBe(false)
    expect(session.state.players[0]!.minorHand).toEqual([fl[18]!.id])
  })

  it('Shepherd with Flock: its owner-only action doubles sheep when there is enough unused land', () => {
    const session = keep(
      flSession([38], (state) => {
        state.players[0]!.occupationPlayed = [fl[38]!.id]
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
    const response = session.takeAction(0, fl[38]!.id)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(4)
  })

  it('Rainmaker: a played improvement adds exactly one crop to the selected field', () => {
    const session = keep(
      flSession([42, 18], (state) => {
        state.players[0]!.occupationPlayed = [fl[42]!.id]
        state.players[0]!.minorHand = [fl[18]!.id]
        Object.assign(state.players[0]!.resources, { wood: 3, clay: 4, reed: 2 })
        state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }]
      }),
    )
    const response = accept(session, playImprovement(session, fl[18]!.id, 'meeting-place'))
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it.each([false, true])(
    'Rubenesque Woman: bonus applies to the second family member=%s',
    (second) => {
      const session = keep(
        flSession([43], (state) => {
          state.players[0]!.occupationPlayed = [fl[43]!.id]
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
      flSession([44], (state) => {
        state.round = 2
        state.currentPlayerIndex = actor
        state.players[0]!.occupationPlayed = [fl[44]!.id]
        state.players[0]!.cardStates[fl[44]!.id] = {
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
      response.state.players[0]!.cardStates[fl[44]!.id]?.extraData?.actionSpaceAttachments,
    ).toEqual([])
  })

  it('Stable Architect: scores only unfenced stables', () => {
    const session = keep(
      flSession([46], (state) => {
        state.players[0]!.occupationPlayed = [fl[46]!.id]
        state.players[0]!.stableTiles = [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ]
        state.players[0]!.pastures = [
          { id: 'p', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 },
        ]
      }),
    )
    expect(bonusScore(session.getState(), fl[46]!.id)).toBe(1)
  })

  it('Farm Lawyer: transfers itself, gains the food difference, and consumes a face-down occupation', () => {
    const session = keep(
      flSession([47], (state) => {
        state.players[0]!.occupationHand = [fl[47]!.id]
        state.players[0]!.resources.food = 0
        state.players[1]!.resources.food = 7
        state.ordinaryCardDecks.occupation = ['A099_FellowGrazer']
      }),
    )
    let response = playOccupation(session, fl[47]!.id)
    response = choose(session, response, response.state.players[1]!.id)
    expect(response.state.players[0]!.resources.food).toBe(7)
    expect(response.state.players[0]!.occupationPlayed).not.toContain(fl[47]!.id)
    expect(response.state.players[1]!.occupationHand).toContain(fl[47]!.id)
    expect(response.state.players[0]!.extraOccupationsFromCards).toHaveLength(1)
    expect(response.state.players[0]!.extraOccupationsFromCards[0]).not.toContain('Harpooner')
    expect(response.state.ordinaryCardDecks.occupation).toEqual([])
  })

  it('Accountant: stored-food purchases do not spend supply food or permit an exhausted second purchase', () => {
    const session = keep(
      flSession([49], (state) => {
        state.players[0]!.occupationPlayed = [fl[49]!.id]
        state.players[0]!.resources.food = 9
        state.players[0]!.cardStates[fl[49]!.id] = { counters: { food: 2 } }
      }),
    )
    let response = takeFlAnytime(session, 49, 'buy')
    response = chooseBranch(session, response, 1)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 9, stone: 1 })
    expect(response.state.players[0]!.cardStates[fl[49]!.id]?.counters?.food).toBe(0)
    expect(session.takeAnytimeAction(0, `${fl[49]!.id}-buy`).ok).toBe(false)
  })

  it('North Sea Fisherman: another player on Fishing receives the additional food', () => {
    const session = keep(
      flSession([51], (state) => {
        state.currentPlayerIndex = 1
        state.players[0]!.occupationPlayed = [fl[51]!.id]
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
        flSession([53], (state) => {
          state.players[0]!.occupationPlayed = [fl[53]!.id]
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
      flSession([54], (state) => {
        state.players[0]!.occupationPlayed = [fl[54]!.id]
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
      flSession([60], (state) => {
        state.players[0]!.occupationPlayed = [fl[60]!.id]
        state.players[0]!.resources.food = 0
      }),
    )
    let response = takeFlAnytime(session, 60, 'give-fences')
    expect(session.withCtx(() => getOwnOrdinaryFenceReserveCount(session.state.players[0]!))).toBe(
      12,
    )
    response = confirmTurns(session, session.takeAction(0, 'day-laborer'))
    response = accept(session, session.takeAction(1, 'forest'))
    expect(response.state.players[1]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(session.withCtx(() => getOwnOrdinaryFenceReserveCount(session.state.players[0]!))).toBe(
      13,
    )
    expect(session.takeAnytimeAction(0, `${fl[60]!.id}-give-fences`).ok).toBe(false)
  })
})
