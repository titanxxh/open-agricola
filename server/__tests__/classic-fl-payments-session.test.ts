import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { flOptions, fl, flSession, chooseBranch, takeFlAnytime } from './_helpers/classic-fl'
import {
  playImprovement,
  playOccupation,
  restoreSession,
  choose,
  bonusScore,
} from './_helpers/card-play-lifecycle'
import { getBreedableAnimalCount } from '../../shared/cards/card-effects'

const sessions: GameSession[] = []
const keep = (session: GameSession) => {
  sessions.push(session)
  return session
}
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

describe('FL: payments and persistent choices', () => {
  it('Gift Table: preserves the goods stack across a pending restore and reserves its non-breeding sheep', () => {
    let session = keep(
      flSession([13], (state) => {
        state.players[0]!.minorHand = [fl[13]!.id]
        Object.assign(state.players[0]!.resources, { wood: 1, food: 8 })
      }),
    )
    let response = playImprovement(session, fl[13]!.id, 'meeting-place')
    expect(response.state.players[0]!.resources.wood).toBe(0)
    for (const good of ['grain', 'wood', 'sheep'] as const) {
      response = takeFlAnytime(session, 13, 'buy-or-cook')
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
        response = chooseBranch(session, response)
      expect(response.state.players[0]!.resources[good]).toBe(1)
      if (
        response.interaction.stateId === 'wait' &&
        response.interaction.request.kind === 'animal-reorg'
      ) {
        const zones = response.interaction.request.zones
        const fixed = zones.find((zone) => zone.fixedAnimalCounts)
        if (fixed) {
          const tampered = zones.map((zone) =>
            zone.id === fixed.id
              ? { ...zone, animalCount: 0, animalType: null, animalCounts: {} }
              : zone,
          )
          const rejected = session.resolveChoice(response.interaction.playerIndex, 'confirm', {
            zones: tampered,
          })
          expect(rejected.ok).toBe(false)
          expect(rejected.state.players[0]!.resources.sheep).toBe(1)
        }
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones })
        expect(response.ok, response.error).toBe(true)
      }
      session = keep(restoreSession(session))
    }
    expect(session.state.players[0]!.resources.food).toBe(5)
    expect(session.state.players[0]!.cardStates[fl[13]!.id]?.counters?.held).toBe(1)
    expect(
      session.withCtx(() =>
        getBreedableAnimalCount(session.state, session.state.players[0]!, 'sheep', 1, {
          sourceCard: fl[13]!.id,
        }),
      ),
    ).toBe(0)
    response = takeFlAnytime(session, 13, 'buy-or-cook')
    response = chooseBranch(session, response, 1)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 7 })
    expect(response.state.players[0]!.cardStates[fl[13]!.id]?.counters?.held ?? 0).toBe(0)
  })

  it('Jenever Distillery: pays and stores the chosen wood after restoring the purchase decision', () => {
    let session = keep(
      flSession([14], (state) => {
        state.players[0]!.minorHand = [fl[14]!.id]
        Object.assign(state.players[0]!.resources, { clay: 3, stone: 1, wood: 4 })
      }),
    )
    let response = playImprovement(session, fl[14]!.id, 'meeting-place')
    expect(response.interaction.stateId).toBe('wait')
    session = keep(restoreSession(session))
    response = chooseBranch(session, session.getState(), 3)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0, wood: 0 })
    expect(response.state.players[0]!.cardStates[fl[14]!.id]?.counters?.wood).toBe(4)
    response = takeFlAnytime(session, 14, 'withdraw')
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.cardStates[fl[14]!.id]?.counters?.wood).toBe(3)
  })

  it.each([0, 1])(
    'Lantern Wonder: %i prior hand discards determine its purchase legality',
    (discarded) => {
      const session = keep(
        flSession([19], (state) => {
          state.players[0]!.minorHand = [fl[19]!.id]
          state.players[0]!.discardedHandCardCount = discarded
        }),
      )
      const response = session.takeAction(0, 'meeting-place')
      if (discarded) {
        expect(response.state.players[0]!.minorHand).toContain(fl[19]!.id)
        expect(
          response.interaction.stateId === 'wait'
            ? !!flOptions(response)?.some(
                (option) => option.value === fl[19]!.id && !option.disabled,
              )
            : false,
        ).toBe(false)
      } else {
        const offered = chooseBranch(session, response)
        const played = offered.state.players[0]!.minorPlayed.includes(fl[19]!.id)
          ? offered
          : choose(session, offered, fl[19]!.id)
        expect(played.state.players[0]!.minorPlayed).toContain(fl[19]!.id)
        expect(bonusScore(played, fl[19]!.id)).toBe(-1)
      }
    },
  )

  it('Cosmographer: a claimed farmyard token cannot be taken twice after restoration', () => {
    let session = keep(
      flSession([39], (state) => {
        state.players[0]!.occupationHand = [fl[39]!.id]
      }),
    )
    let response = playOccupation(session, fl[39]!.id)
    response = choose(session, response, '0-1')
    expect(response.ok, response.error).toBe(true)
    session = keep(restoreSession(session))
    response = choose(session, session.getState(), '0-2')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(2)
    response = takeFlAnytime(session, 39, 'take')
    response = choose(session, response, '0-1')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.reed).toBe(1)
    expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(1)
    response = takeFlAnytime(session, 39, 'take')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
      response = choose(session, session.getState(), '0-2')
    expect(response.state.players[0]!.resources.stone).toBe(1)
    expect(session.takeAnytimeAction(0, `${fl[39]!.id}-take`).ok).toBe(false)
  })

  it('Vegetable Seller: borrowing is repeatable and survives restoration as outstanding debt', () => {
    let session = keep(
      flSession([36], (state) => {
        state.players[0]!.occupationPlayed = [fl[36]!.id]
      }),
    )
    let response = takeFlAnytime(session, 36, 'borrow')
    session = keep(restoreSession(session))
    response = takeFlAnytime(session, 36, 'borrow')
    expect(response.state.players[0]!.resources.vegetable).toBe(2)
    expect(response.state.players[0]!.cardStates[fl[36]!.id]?.extraData).toMatchObject({
      borrowed: 2,
    })
  })

  it('Scribbler: an occupation can be paid with stored food when the supply is empty', () => {
    const session = keep(
      flSession([52, 33], (state) => {
        state.players[0]!.occupationPlayed = [fl[52]!.id]
        state.players[0]!.occupationHand = [fl[33]!.id]
        state.players[0]!.resources.food = 0
        state.players[0]!.cardStates[fl[52]!.id] = { counters: { food: 2 } }
      }),
    )
    let response = playOccupation(session, fl[33]!.id)
    if (!response.state.players[0]!.occupationPlayed.includes(fl[33]!.id))
      response = chooseBranch(session, response)
    expect(response.state.players[0]!.occupationPlayed).toContain(fl[33]!.id)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.cardStates[fl[52]!.id]?.counters?.food).toBe(1)
    expect(
      response.state.events.some(
        (event) => event.type === 'resource.paid' && JSON.stringify(event).includes(fl[52]!.id),
      ),
    ).toBe(true)
  })

  it.each([0, 1])(
    'Gold Weigher: printed 2 VP improvement requires %i available food for its recipient fee',
    (food) => {
      const session = keep(
        flSession([58], (state) => {
          state.players[1]!.occupationPlayed = [fl[58]!.id]
          state.players[1]!.resources.food = 5
          Object.assign(state.players[0]!.resources, { clay: 3, stone: 1, food })
          state.actionSpaces.find((space) => space.id === 'major-improvement')!.roundAvailable = 1
          state.roundActionOrder = state.roundActionOrder.filter((id) => id !== 'major-improvement')
        }),
      )
      let response = session.takeAction(0, 'major-improvement')
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId !== 'wait') throw new Error('Expected improvement selection')
      const oven = flOptions(response)?.find((option) => option.value === 'Major_ClayOven')
      if (!food) {
        expect(!oven || oven.disabled).toBeTruthy()
        expect(response.state.players[1]!.resources.food).toBe(5)
        return
      }
      response = choose(session, response, 'Major_ClayOven')
      if (!response.state.players[0]!.improvements.includes('Major_ClayOven'))
        response = chooseBranch(session, response)
      expect(response.state.players[0]!.improvements).toContain('Major_ClayOven')
      expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 0, stone: 0 })
      expect(response.state.players[1]!.resources.food).toBe(6)
    },
  )
})
