import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import type { GameSession } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { getAssignedAnimalsByType } from '../../shared/domain/animals'

// Approved generic Session seam: a real 2-player work game collects a boar and
// submits three card holder candidates. Two groups each allow one occupied zone.
// Verify confirm persistence/events, atomic same-group rejection, and retry.
// The sole mutator caller validates all groups first; persistence must not prune
// accepted assignments with another per-card limit.
const CARD = 'X_OccupancyGroups'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup() {
  const session = createWorkSession({ seed: 42, options: { playerCount: 2 }, configure(state) {
    state.round = 8
    const player = state.players[0]!
    player.minorPlayed = [CARD]
    player.resources.food = 20
    player.resources.sheep = 1
    player.houseAnimals = { '1-0': 'sheep' }
    state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 1
  } })
  session.withCtx(() => requireActiveCardRegistry('occupancy group regression').registerEffects([{
    id: CARD,
    onComputeAnimalZones: (player, zones) => {
      for (const [slot, group] of [['a', 'first'], ['b', 'second'], ['c', 'first']]) zones.push({
        id: `card:${CARD}:${slot}`, cardId: CARD, ownerPlayerId: player.id,
        zoneType: 'card', capacity: 1, animalType: null, animalCount: 0,
        occupancyGroup: `${player.id}:${group}`, occupiedZoneLimit: 1,
      })
    },
  }]))
  sessions.push(session)
  return session
}

const assignments = [
  { id: `card:${CARD}:a`, zoneType: 'card' as const, animalType: 'sheep' as const, animalCount: 1 },
  { id: `card:${CARD}:b`, zoneType: 'card' as const, animalType: 'boar' as const, animalCount: 1 },
]

describe('Animal-zone occupancy group persistence', () => {
  it('keeps one animal in each independent group on the same card', () => {
    const session = setup()
    const pending = session.takeAction(0, 'pig-market')
    expect(pending.ok).toBe(true)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    const confirmed = session.resolveChoice(0, 'confirm', { zones: assignments })
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(confirmed.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1 })
    expect(confirmed.state.players[0]!.cardStates[CARD]?.extraData?.animalCountsByZone).toMatchObject({
      [`card:${CARD}:a`]: { animalCounts: { sheep: 1 } },
      [`card:${CARD}:b`]: { animalCounts: { boar: 1 } },
    })
    expect(session.withCtx(() => getAssignedAnimalsByType(confirmed.state.players[0]!, confirmed.state))).toMatchObject({ sheep: 1, boar: 1 })
    expect(confirmed.state.events).toContainEqual(expect.objectContaining({ type: 'farm.animalMoved', animals: { sheep: 1, boar: 1 } }))
    expect(confirmed.state.events.some(event => event.type === 'farm.animalDiscarded')).toBe(false)
    expect(confirmed.state.log.some(entry => entry.key === 'log.reorganizeDiscard')).toBe(false)
    expect(confirmed.scores).toHaveLength(2)
  })

  it('rejects two occupied holders in the same group atomically and accepts separate groups on retry', () => {
    const session = setup()
    const pending = session.takeAction(0, 'pig-market')
    const rejected = session.resolveChoice(0, 'confirm', { zones: [assignments[0], { ...assignments[1], id: `card:${CARD}:c` }] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(pending.state)
    expect(rejected.interaction).toEqual(pending.interaction)
    expect(rejected.scores).toEqual(pending.scores)
    const retry = session.resolveChoice(0, 'confirm', { zones: assignments })
    expect(retry.ok).toBe(true)
    expect(retry.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1 })
  })
})
