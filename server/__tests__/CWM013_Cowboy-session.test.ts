import { afterEach, describe, expect, it } from 'vitest'
import type { GameState, InteractionAnimalReorgZone } from '../../shared/contract/types'
import { getAssignedAnimalsByType } from '../../shared/domain/animals'
import { getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'
import { familySize, workersAtHome } from '../../shared/domain/player'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import {
  assertRejectedUnchanged,
  assertUndoRestored,
  getChoiceOptions,
  undoRuleSnapshot,
} from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'
import { resolveNonSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import '../../shared/cards/D/D051_Archway'

const COWBOY = 'CWM013_Cowboy'
const PLACEHOLDER = '__test_placeholder__'
const MARKETS = [
  { id: 'sheep-market', animal: 'sheep', score: 'sheeps' },
  { id: 'pig-market', animal: 'boar', score: 'boars' },
  { id: 'cattle-market', animal: 'cattle', score: 'cattles' },
] as const
type Animal = (typeof MARKETS)[number]['animal']
const GUEST = { id: 'guest:1', sourceCardId: 'CI073_Guest', round: 12 }
const ARCHWAY = 'D051_Archway'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

/**
 * A new two-player game in round 12, not a harvest round, with every market revealed and empty.
 * P1 has played Cowboy; both players have two people at home, only rooms and a house pet place.
 */
function setup(configure?: (state: GameState) => void, current: 0 | 1 = 1) {
  const session = createWorkSession({
    seed: 13,
    configure(state) {
      state.round = 12
      state.currentPlayerIndex = current
      for (const player of state.players) {
        player.minorHand = [PLACEHOLDER]
        player.occupationHand = [PLACEHOLDER]
        player.minorPlayed = []
        player.occupationPlayed = []
        player.cardStates = {}
      }
      state.players[0]!.occupationPlayed = [COWBOY]
      for (const market of MARKETS) {
        const space = state.actionSpaces.find((candidate) => candidate.id === market.id)!
        space.resources[market.animal] = 0
        space.takenBy = []
      }
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}

const space = (response: SessionResponse, spaceId: string) =>
  response.state.actionSpaces.find((candidate) => candidate.id === spaceId)!
const setAnimals = (state: GameState, spaceId: string, animal: Animal, count: number) => {
  state.actionSpaces.find((candidate) => candidate.id === spaceId)!.resources[animal] = count
}
const ok = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  return response
}
const assigned = (response: SessionResponse, seat = 0) =>
  getAssignedAnimalsByType(response.state.players[seat]!, response.state)
const scoreQuantity = (response: SessionResponse, key: string, seat = 0) =>
  response.scores[seat]!.categories.find((category) => category.key === key)?.quantity
const cowboyLogs = (response: SessionResponse) =>
  response.state.log.filter((entry) => entry.params?.cardId === COWBOY)
const cowboyEvents = (response: SessionResponse) =>
  response.state.events.filter((event) => event.sourceCardId === COWBOY)

/** Accepts the server's own animal layout and hands the turn on, leaving every other wait in place. */
function settle(session: GameSession, initial: SessionResponse) {
  let response = ok(initial)
  for (let step = 0; step < 6 && response.interaction.stateId === 'wait'; step++) {
    const { request, playerIndex } = response.interaction
    if (request.kind === 'animal-reorg') response = ok(session.resolveChoice(playerIndex, 'confirm', { zones: request.zones }))
    else if (request.kind === 'confirm-next-player') response = ok(confirmNextPlayer(session))
    else break
  }
  return response
}

/** Cowboy's single animal: the log names the card as a replacement and the gain is exactly one. */
function expectOneAnimalFromCowboy(response: SessionResponse, animal: Animal) {
  expect(cowboyLogs(response)).toContainEqual(expect.objectContaining({
    key: 'log.cardTriggered',
    params: expect.objectContaining({ cardId: COWBOY, replacement: true }),
  }))
  expect(cowboyEvents(response)).toContainEqual(expect.objectContaining({
    type: 'resource.moved', resources: { [animal]: 1 }, to: { kind: 'player', playerId: 'p1' },
  }))
}

describe('CWM013 Cowboy uses an occupied market for one animal', () => {
  it.each(MARKETS)('S1 $id taken by the opponent still gives P1 one $animal, and undo restores it', ({ id, animal, score }) => {
    const session = setup((state) => setAnimals(state, id, animal, 1))

    const opponent = settle(session, session.takeAction(1, id))
    expect(space(opponent, id).takenBy).toEqual([{ playerId: 'p2', workerId: '1' }])
    expect(space(opponent, id).resources[animal]).toBe(0)
    expect(opponent.state.currentPlayerIndex).toBe(0)
    expect(opponent.interaction.stateId).toBe('idle')
    expect(session.getActionAvailability(0)[id]).toBe(true)
    const before = undoRuleSnapshot(opponent)

    const pending = ok(session.takeAction(0, id))
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'animal-reorg' } })
    expect(pending.state.players[0]!.resources[animal]).toBe(1)
    assertUndoRestored(before, session.undoAction())
    expect(session.getActionAvailability(0)[id]).toBe(true)

    const used = settle(session, session.takeAction(0, id))
    expect(space(used, id).takenBy).toEqual([
      { playerId: 'p2', workerId: '1' },
      { playerId: 'p1', workerId: '1' },
    ])
    expect(space(used, id).resources[animal]).toBe(0)
    expect(assigned(used)[animal]).toBe(1)
    expect(scoreQuantity(used, score)).toBe(1)
    expectOneAnimalFromCowboy(used, animal)
    expect(used.state.currentPlayerIndex).toBe(1)
  })

  it('S2 animals left on an occupied market stay there; P1 gets one from the supply', () => {
    const session = setup((state) => {
      const market = state.actionSpaces.find((candidate) => candidate.id === 'sheep-market')!
      market.resources.sheep = 2
      market.takenBy = [{ playerId: 'p2', workerId: '1' }]
    }, 0)

    const used = settle(session, session.takeAction(0, 'sheep-market'))

    expect(assigned(used).sheep).toBe(1)
    expect(space(used, 'sheep-market').resources.sheep).toBe(2)
    expectOneAnimalFromCowboy(used, 'sheep')
  })

  it('S3 a Guest can be sent to a market the opponent occupies and gets one animal', () => {
    const session = setup((state) => {
      setAnimals(state, 'sheep-market', 'sheep', 1)
      state.players[0]!.guests = [GUEST]
    })
    const offered = settle(session, session.takeAction(1, 'sheep-market'))
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    const guest = getChoiceOptions(offered).find((option) => option.labelParams?.guestId === GUEST.id)
    expect(guest, JSON.stringify(offered.interaction)).toBeDefined()

    const targets = ok(session.resolveChoice(0, guest!.value))
    expect(targets.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionPlaceFarmerExtra' })
    expect(getChoiceOptions(targets).map((option) => option.value)).toContain('allow-occupied:sheep-market')

    const placed = settle(session, session.resolveChoice(0, 'allow-occupied:sheep-market'))
    expect(space(placed, 'sheep-market').takenBy).toEqual([
      { playerId: 'p2', workerId: '1' },
      { playerId: 'p1', workerId: 'guest:1', guest: true },
    ])
    expect(placed.state.players[0]!.guests).toEqual([{ ...GUEST, dispatched: true }])
    expect(assigned(placed).sheep).toBe(1)
    expectOneAnimalFromCowboy(placed, 'sheep')
  })

  it('S4 P1 can use a market its own person occupies; both people are recorded and go home', () => {
    const session = setup((state) => setAnimals(state, 'sheep-market', 'sheep', 2), 0)

    const first = settle(session, session.takeAction(0, 'sheep-market'))
    expect(assigned(first).sheep).toBe(2)
    expect(cowboyLogs(first)).toEqual([])
    settle(session, session.takeAction(1, 'forest'))
    expect(session.getActionAvailability(0)['sheep-market']).toBe(true)

    const second = settle(session, session.takeAction(0, 'sheep-market'))
    expect(space(second, 'sheep-market').takenBy).toEqual([
      { playerId: 'p1', workerId: '1' },
      { playerId: 'p1', workerId: '2' },
    ])
    expect(assigned(second).sheep).toBe(3)
    expect(second.state.log.filter((entry) => entry.key === 'log.placeFarmer' && entry.playerId === 'p1'
      && entry.params?.action === 'actions.sheep-market.name')).toHaveLength(2)
    expectOneAnimalFromCowboy(second, 'sheep')

    const roundEnd = autoAdvanceRoundEnd(session, { initialResponse: settle(session, session.takeAction(1, 'clay-pit')) })
    expect(roundEnd.state.round).toBe(13)
    expect(space(roundEnd, 'sheep-market').takenBy).toEqual([])
    expect(workersAtHome(roundEnd.state, roundEnd.state.players[0]!).map((worker) => worker.id)).toEqual(['1', '2'])
    expect(assigned(roundEnd).sheep).toBe(3)
  })

  it('S5 P1 can use a market its own Guest occupies; the family member stays, the Guest leaves', () => {
    const session = setup((state) => {
      setAnimals(state, 'sheep-market', 'sheep', 1)
      state.players[0]!.guests = [GUEST]
    })
    const offered = settle(session, session.takeAction(1, 'forest'))
    const guest = getChoiceOptions(offered).find((option) => option.labelParams?.guestId === GUEST.id)
    ok(session.resolveChoice(0, guest!.value))
    const sent = settle(session, session.resolveChoice(0, 'sheep-market'))
    expect(space(sent, 'sheep-market').takenBy).toEqual([{ playerId: 'p1', workerId: 'guest:1', guest: true }])
    expect(assigned(sent).sheep).toBe(1)

    let turn = sent
    if (turn.state.currentPlayerIndex === 1) turn = settle(session, session.takeAction(1, 'clay-pit'))
    expect(turn.state.currentPlayerIndex).toBe(0)
    expect(session.getActionAvailability(0)['sheep-market']).toBe(true)
    const used = settle(session, session.takeAction(0, 'sheep-market'))
    expect(space(used, 'sheep-market').takenBy).toEqual([
      { playerId: 'p1', workerId: 'guest:1', guest: true },
      { playerId: 'p1', workerId: '1' },
    ])
    expect(assigned(used).sheep).toBe(2)
    expectOneAnimalFromCowboy(used, 'sheep')

    let rest = used
    for (let step = 0; step < 4 && rest.state.round === 12 && rest.interaction.stateId === 'idle'; step++) {
      const seat = rest.state.currentPlayerIndex
      const target = ['reed-bank', 'day-laborer', 'grain-seeds', 'fishing']
        .find((spaceId) => session.getActionAvailability(seat)[spaceId])!
      rest = settle(session, session.takeAction(seat, target))
    }
    const roundEnd = autoAdvanceRoundEnd(session, { initialResponse: rest })
    expect(roundEnd.state.round).toBe(13)
    expect(space(roundEnd, 'sheep-market').takenBy).toEqual([])
    expect(roundEnd.state.players[0]!.guests ?? []).toEqual([])
    expect(familySize(roundEnd.state.players[0]!)).toBe(2)
    expect(workersAtHome(roundEnd.state, roundEnd.state.players[0]!).map((worker) => worker.id)).toEqual(['1', '2'])
  })
})

describe('CWM013 Cowboy with a person moved onto a market', () => {
  it.each([
    ['an unoccupied market collects the whole pile', false, 3],
    ['a market the opponent emptied gets one sheep', true, 1],
  ] as const)('S6 a person D051_Archway moves onto %s', (_name, occupied, gained) => {
    const session = setup((state) => {
      state.players[0]!.minorPlayed = [ARCHWAY]
      state.actionSpaces.push(...createPlayerActionSpaces(state))
      setAnimals(state, 'sheep-market', 'sheep', 3)
    }, 0)
    settle(session, session.takeAction(0, ARCHWAY))
    settle(session, session.takeAction(1, occupied ? 'sheep-market' : 'forest'))
    settle(session, session.takeAction(0, 'day-laborer'))
    let response = settle(session, session.takeAction(1, 'clay-pit'))
    if (response.interaction.stateId !== 'wait') response = session.performRoundEnd()
    response = resolveNonSkipChoice(session, resolveTriggerIfPresent(session, response, ARCHWAY))
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionMoveFarmerToSpace' })

    const moved = ok(session.resolveChoice(0, 'sheep-market'))
    expect(moved.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'animal-reorg' } })
    expect(space(moved, ARCHWAY).takenBy).toEqual([])
    expect(space(moved, 'sheep-market').takenBy).toEqual([
      ...(occupied ? [{ playerId: 'p2', workerId: '1' }] : []),
      { playerId: 'p1', workerId: '1' },
    ])
    expect(moved.state.players[0]!.resources.sheep).toBe(gained)
    expect(space(moved, 'sheep-market').resources.sheep).toBe(0)
    expect(cowboyLogs(moved).length > 0).toBe(occupied)

    expect(assigned(settle(session, moved)).sheep).toBe(gained)
  })
})

describe('CWM013 Cowboy stays silent elsewhere', () => {
  it('N1 an unplayed Cowboy does not open an occupied market', () => {
    const session = setup((state) => {
      state.players[0]!.occupationPlayed = []
      state.players[0]!.occupationHand = [COWBOY]
      setAnimals(state, 'sheep-market', 'sheep', 1)
    })
    settle(session, session.takeAction(1, 'sheep-market'))

    expect(session.getActionAvailability(0)['sheep-market']).toBe(false)
    const rejected = assertRejectedUnchanged(session, () => session.takeAction(0, 'sheep-market'))
    expect(rejected.error).toBe('space unavailable')
  })

  it('N2 an occupied accumulation space that is not a market stays closed', () => {
    const session = setup()
    settle(session, session.takeAction(1, 'forest'))

    expect(session.getActionAvailability(0).forest).toBe(false)
    const rejected = assertRejectedUnchanged(session, () => session.takeAction(0, 'forest'))
    expect(rejected.error).toBe('space unavailable')
  })

  it('N3 an unoccupied market is an ordinary use: all accumulated animals, no Cowboy replacement', () => {
    const session = setup((state) => setAnimals(state, 'sheep-market', 'sheep', 2), 0)

    const used = settle(session, session.takeAction(0, 'sheep-market'))

    expect(assigned(used).sheep).toBe(2)
    expect(space(used, 'sheep-market').resources.sheep).toBe(0)
    expect(cowboyLogs(used)).toEqual([])
    expect(cowboyEvents(used)).toEqual([])
  })
})

describe('CWM013 Cowboy keeps animals on an unused farmyard space', () => {
  const cowboyZones = (response: SessionResponse) => {
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg',
      JSON.stringify(response.interaction)).toBe(true)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') return []
    return response.interaction.request.zones.filter((zone) => zone.cardId === COWBOY)
  }
  const houseZone = (response: SessionResponse) => {
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') throw new Error('no reorg')
    return response.interaction.request.zones.find((zone) => zone.zoneType === 'house')!
  }
  const fill = (zone: InteractionAnimalReorgZone, count: number): InteractionAnimalReorgZone =>
    ({ ...zone, animalType: 'sheep', animalCount: count, animalCounts: { sheep: count } })

  it('A1 two sheep of one kind sit on one unused space, which still scores as unused; a third does not fit there', () => {
    const session = setup((state) => setAnimals(state, 'sheep-market', 'sheep', 3), 0)
    const emptyBefore = scoreQuantity(session.getState(), 'empty')

    const reorg = ok(session.takeAction(0, 'sheep-market'))
    const [first, second] = cowboyZones(reorg)
    expect(first).toMatchObject({ capacity: 2, countsFarmyardSpaceAsUnused: true, occupiedZoneLimit: 1 })
    const house = houseZone(reorg)

    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'confirm', { zones: [fill(first!, 3)] }))
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'confirm', { zones: [fill(first!, 2), fill(second!, 1)] }))

    const kept = settle(session, session.resolveChoice(0, 'confirm', { zones: [fill(house, 1), fill(first!, 2)] }))
    expect(assigned(kept).sheep).toBe(3)
    expect(scoreQuantity(kept, 'sheeps')).toBe(3)
    expect(scoreQuantity(kept, 'empty')).toBe(emptyBefore)
    expect(getUsedFarmyardTileKeys(kept.state.players[0]!)).not.toContain(`${first!.farmPosition!.row}-${first!.farmPosition!.col}`)
  })
})
