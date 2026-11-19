import { afterEach, describe, expect, it } from 'vitest'
import { getRoundPersonPlacementDetails } from '../../shared/cards/helpers/round-placement'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { hasNoUnusedFarmyardSpaces } from '../../shared/domain/farm'
import {
  familySize, getFamilyTokenLimit, inactiveWorkersInSupply, setActiveWorkerCount, workersAvailable,
} from '../../shared/domain/player'
import { getHarvestRequirements } from '../../shared/session/harvest-requirements'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { getChoiceOptions } from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'
import { chooseSupplyWorkerTurn, takeNormalWorkerTurn } from './_helpers/supply-worker-turn'

// ADR 0050 (#1864): the Guest mechanism in a game that holds cards of both editions. Animal Farm is
// the classic card that grants the Guest; the other card of each scenario is a revised one.
const ANIMAL_FARM = 'CG062_AnimalFarm'
const MOTIVATOR = 'E093_Motivator'
const TEA_TIME = 'E003_TeaTime'
const PLACEHOLDER = '__test_placeholder__'
const HARVEST_ROUND = 7
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

/** Two rooms, a two-space pasture holding one sheep and fields everywhere else: no unused farmyard space. */
function fillFarm(owner: PlayerState) {
  const pasture = [{ row: 1, col: 1 }, { row: 1, col: 2 }]
  owner.resources.sheep = 1
  owner.pastures = [{ id: 'sheep', animalType: 'sheep', animalCount: 1, tiles: pasture }]
  owner.fenceSegments = ['H-1-1', 'H-1-2', 'H-2-1', 'H-2-2', 'V-1-1', 'V-1-3'].map(edge => ({
    edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id },
  }))
  const built = new Set([...owner.roomTiles, ...pasture].map(tile => `${tile.row},${tile.col}`))
  owner.fields = Array.from({ length: 15 }, (_, index) => ({ row: Math.floor(index / 5), col: index % 5, stacks: [] }))
    .filter(tile => !built.has(`${tile.row},${tile.col}`))
}

/**
 * A new 2-player game in the work phase of `round`. A (seat 0) is to move with that farm, its sheep,
 * and Animal Farm in play.
 */
function setup(round: number, configure: (state: GameState) => void) {
  const session = createWorkSession({ seed: 62, configure(state) {
    state.round = round
    for (const player of state.players) {
      player.minorHand = [PLACEHOLDER]
      player.occupationHand = [PLACEHOLDER]
      player.minorPlayed = []
      player.occupationPlayed = []
    }
    const owner = state.players[0]!
    owner.minorPlayed = [ANIMAL_FARM]
    fillFarm(owner)
    configure(state)
  } })
  sessions.push(session)
  const opened = session.getState()
  expect(opened.state.players[0]!.minorPlayed).toEqual([ANIMAL_FARM])
  expect(opened.state.currentPlayerIndex).toBe(0)
  expect(opened.interaction.stateId).toBe('idle')
  return session
}

/** That game in a harvest round, with `family` family members for A and Motivator in play as well. */
function setupWithMotivator(family: 4 | 5) {
  const session = setup(HARVEST_ROUND, (state) => {
    // No food, and one grain to convert: every player settles the feeding by hand.
    for (const player of state.players) Object.assign(player.resources, { food: 0, grain: 1 })
    setActiveWorkerCount(state.players[0]!, family)
    // Eight spaces that ask nothing further: A's six placements and B's two.
    state.actionSpaces.find(candidate => candidate.id === 'western-quarry')!.resources.stone = 1
  })
  // Motivator is already in play. Loading opens A's turn the way rotation does.
  const state = captureStateWithHistory(session.getState().state)
  state.players[0]!.occupationPlayed = [MOTIVATOR]
  const loaded = session.loadState(state)
  expect(loaded.ok, loaded.error).toBe(true)
  const owner = loaded.state.players[0]!
  expect(hasNoUnusedFarmyardSpaces(owner)).toBe(true)
  expect(familySize(owner)).toBe(family)
  expect(loaded.state.currentPlayerIndex).toBe(0)
  return session
}

const exchangeEntry = (response: SessionResponse) =>
  response.interaction.stateId === 'gameover' ? undefined
    : response.interaction.anytimeActions.find(action => action.sourceCard === ANIMAL_FARM)

/** A returns its sheep to the supply for a Guest of this round. */
function exchange(session: GameSession) {
  const entry = exchangeEntry(session.getState())
  expect(entry, 'Animal Farm exchange is offered').toBeDefined()
  const response = session.takeAnytimeAction(0, entry!.id)
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources.sheep).toBe(0)
  return response
}

/** What A may place this turn: each option's label, with the card or the Guest it stands for. */
const placementOptions = (response: SessionResponse) =>
  getChoiceOptions(response).map(option => [option.labelKey, option.sourceCard ?? option.labelParams?.guestId])
const ORDINARY = ['actions.place-farmer.name', undefined]
const SUPPLY_PERSON = ['actions.activate-extra-turn.name', MOTIVATOR]
const GUEST = ['actions.activate-extra-turn.name', 'guest:1']
const DECLINE = ['ui.interactionDecline', undefined]

/** Picks the Guest in the pending placement choice and sends it to `spaceId`. */
function dispatchGuest(session: GameSession, spaceId: string) {
  const option = getChoiceOptions(session.getState()).find(candidate => candidate.labelParams?.guestId === 'guest:1')
  expect(option, 'the Guest is offered').toBeDefined()
  const targets = session.resolveChoice(0, option!.value)
  expect(targets.ok, targets.error).toBe(true)
  expect(targets.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionPlaceFarmerExtra' })
  const placed = session.resolveChoice(0, spaceId)
  expect(placed.ok, placed.error).toBe(true)
  return placed
}

function act(session: GameSession, playerIndex: number, spaceId: string) {
  const response = session.takeAction(playerIndex, spaceId)
  expect(response.ok, response.error).toBe(true)
  return response
}

const space = (response: SessionResponse, spaceId: string) =>
  response.state.actionSpaces.find(candidate => candidate.id === spaceId)!
/** The Person Placement Order as each use of an action space recorded it for `playerId`. */
const personUses = (response: SessionResponse, playerId: string) => response.state.events.flatMap(event =>
  event.type === 'actionSpace.useStarted' && event.actorPlayerId === playerId ? [event.personUse] : [])
const farmersScore = (response: SessionResponse) => response.scores![0]!.categories.find(category => category.key === 'farmers')
/** The people a return home sent `to` that place, as `player:person`. */
const returned = (response: SessionResponse, to: 'home' | 'supply') => response.state.events
  .flatMap(event => event.type === 'worker.returned' && event.to === to ? event.workers : [])
  .map(worker => `${worker.playerId}:${worker.workerId}`).sort()

describe('Guest next to a revised Supply Person card', () => {
  it('gives A with all five family members a Guest but no Supply Person from Motivator: six placements, five people to feed', () => {
    const session = setupWithMotivator(5)
    const a = session.state.players[0]!.id

    // Motivator places a family token from A's own supply, and none is left there.
    const first = session.getState()
    expect(getFamilyTokenLimit(first.state.players[0]!)).toBe(5)
    expect(inactiveWorkersInSupply(first.state.players[0]!)).toEqual([])
    expect(first.interaction.stateId).toBe('idle')

    // The Guest comes from the general supply: the exchange and its turn are there all the same.
    const offered = exchange(session)
    expect(offered.state.players[0]!.guests).toEqual([
      { id: 'guest:1', sourceCardId: ANIMAL_FARM, round: HARVEST_ROUND },
    ])
    expect(placementOptions(offered)).toEqual([ORDINARY, GUEST])

    // A places all five family members first; B rotates normally in between.
    expect(takeNormalWorkerTurn(session, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    act(session, 1, 'day-laborer')
    expect(placementOptions(confirmNextPlayer(session))).toEqual([ORDINARY, GUEST])
    expect(takeNormalWorkerTurn(session, 'clay-pit').ok).toBe(true)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    act(session, 1, 'fishing')
    for (const spaceId of ['reed-bank', 'western-quarry', 'grain-seeds']) {
      expect(placementOptions(confirmNextPlayer(session))).toEqual([ORDINARY, GUEST])
      expect(takeNormalWorkerTurn(session, spaceId).ok).toBe(true)
    }

    // Every family token is on the board. The Guest is a sixth placement, which A may still decline.
    const lastChance = confirmNextPlayer(session)
    expect(lastChance.state.roundPhase).toBe('work')
    expect(workersAvailable(lastChance.state, lastChance.state.players[0]!)).toBe(0)
    expect(lastChance.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(placementOptions(lastChance)).toEqual([GUEST, DECLINE])
    const placed = dispatchGuest(session, 'meeting-place')

    const owner = placed.state.players[0]!
    expect(space(placed, 'meeting-place').takenBy).toEqual([{ playerId: a, workerId: 'guest:1', guest: true }])
    // The Person Placement Order counts the Guest as the sixth person A placed.
    expect(getRoundPersonPlacementDetails(owner)).toEqual([
      { spaceId: 'forest', workerId: '1' },
      { spaceId: 'clay-pit', workerId: '2' },
      { spaceId: 'reed-bank', workerId: '3' },
      { spaceId: 'western-quarry', workerId: '4' },
      { spaceId: 'grain-seeds', workerId: '5' },
      { spaceId: 'meeting-place', workerId: 'guest:1' },
    ])
    expect(personUses(placed, a)).toEqual([
      { workerId: '1', placementOrdinal: 1 },
      { workerId: '2', placementOrdinal: 2 },
      { workerId: '3', placementOrdinal: 3 },
      { workerId: '4', placementOrdinal: 4 },
      { workerId: '5', placementOrdinal: 5 },
      { workerId: 'guest:1', placementOrdinal: 6 },
    ])
    expect(getRoundPersonPlacementDetails(placed.state.players[1]!).map(entry => entry.spaceId)).toEqual(['day-laborer', 'fishing'])
    // The family is still the five tokens: the Guest took none, and it neither eats nor scores.
    expect(familySize(owner)).toBe(5)
    expect(getFamilyTokenLimit(owner)).toBe(5)
    expect(owner.workers.map(worker => worker.id)).toEqual(['1', '2', '3', '4', '5'])
    expect(session.withCtx(() => getHarvestRequirements(placed.state, owner))).toMatchObject({ round: HARVEST_ROUND, food: 10 })
    expect(farmersScore(placed)).toMatchObject({ quantity: 5, total: 15 })

    // The harvest asks A for five people's food.
    const feeding = confirmNextPlayer(session)
    expect(feeding.state.roundPhase).toBe('feeding')
    expect(feeding.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed', remaining: 10 } })
    expect(feeding.state.players[0]!.guests).toEqual([])
  })

  it('lets A with four family members place a Supply Person through Motivator and dispatch a Guest in one round: six placements, four people to feed', () => {
    const opening = setupWithMotivator(4)
    const [a, b] = opening.state.players.map(player => player.id)

    // Motivator offers the fifth family token, still in A's supply, on A's first turn.
    const first = opening.getState()
    expect(inactiveWorkersInSupply(first.state.players[0]!).map(worker => worker.id)).toEqual(['5'])
    expect(first.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(placementOptions(first)).toEqual([ORDINARY, SUPPLY_PERSON])

    // The exchange is open on that turn too. Its Guest waits while A takes Motivator's turn.
    const granted = exchange(opening)
    expect(granted.state.players[0]!.guests).toEqual([
      { id: 'guest:1', sourceCardId: ANIMAL_FARM, round: HARVEST_ROUND },
    ])
    expect(placementOptions(granted)).toContainEqual(SUPPLY_PERSON)
    chooseSupplyWorkerTurn(opening, MOTIVATOR)
    const supplied = opening.resolveChoice(0, 'forest')
    expect(supplied.ok, supplied.error).toBe(true)
    expect(space(supplied, 'forest').takenBy).toEqual([{ playerId: a, workerId: '5' }])
    expect(supplied.state.players[0]!.workers.find(worker => worker.id === '5')?.supplyUse)
      .toMatchObject({ sourceCard: MOTIVATOR, status: 'temporary' })
    expect(supplied.state.players[0]!.guests).toHaveLength(1)
    expect(confirmNextPlayer(opening).state.currentPlayerIndex).toBe(1)
    act(opening, 1, 'day-laborer')

    // Back at A, the Supply Person is used and the Guest is still to dispatch.
    expect(placementOptions(confirmNextPlayer(opening))).toEqual([ORDINARY, GUEST])
    const dispatched = dispatchGuest(opening, 'clay-pit')
    expect(space(dispatched, 'clay-pit').takenBy).toEqual([{ playerId: a, workerId: 'guest:1', guest: true }])
    expect(workersAvailable(dispatched.state, dispatched.state.players[0]!)).toBe(4)

    // Resume the round with both people on the board.
    const snapshot = serializeSessionSnapshot(opening.state, opening)
    const session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    sessions.push(session)
    const restored = session.getState()
    expect(restored.interaction).toEqual(dispatched.interaction)
    expect(space(restored, 'forest').takenBy).toEqual([{ playerId: a, workerId: '5' }])
    expect(space(restored, 'clay-pit').takenBy).toEqual([{ playerId: a, workerId: 'guest:1', guest: true }])
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    act(session, 1, 'fishing')

    // Both extra people are placed: A has ordinary turns left for its four family members.
    for (const spaceId of ['reed-bank', 'western-quarry', 'grain-seeds', 'meeting-place']) {
      const turn = confirmNextPlayer(session)
      expect(turn.state.currentPlayerIndex).toBe(0)
      expect(turn.interaction.stateId).toBe('idle')
      act(session, 0, spaceId)
    }

    const placed = session.getState()
    const owner = placed.state.players[0]!
    // The Person Placement Order counts the Supply Person and the Guest like the family members.
    expect(getRoundPersonPlacementDetails(owner)).toEqual([
      { spaceId: 'forest', workerId: '5' },
      { spaceId: 'clay-pit', workerId: 'guest:1' },
      { spaceId: 'reed-bank', workerId: '1' },
      { spaceId: 'western-quarry', workerId: '2' },
      { spaceId: 'grain-seeds', workerId: '3' },
      { spaceId: 'meeting-place', workerId: '4' },
    ])
    expect(personUses(placed, a)).toEqual([
      { workerId: '5', placementOrdinal: 1 },
      { workerId: 'guest:1', placementOrdinal: 2 },
      { workerId: '1', placementOrdinal: 3 },
      { workerId: '2', placementOrdinal: 4 },
      { workerId: '3', placementOrdinal: 5 },
      { workerId: '4', placementOrdinal: 6 },
    ])
    // Neither of them is a family member: four people eat and score.
    expect(familySize(owner)).toBe(4)
    expect(getFamilyTokenLimit(owner)).toBe(5)
    expect(session.withCtx(() => getHarvestRequirements(placed.state, owner))).toMatchObject({ round: HARVEST_ROUND, food: 8 })
    expect(farmersScore(placed)).toMatchObject({ quantity: 4, total: 12 })

    // Return home: the Supply Person goes back to A's own supply and the family members go home.
    // The Guest leaves for the general supply, which no fact reports.
    const feeding = confirmNextPlayer(session)
    expect(feeding.state.actionSpaces.flatMap(candidate => candidate.takenBy)).toEqual([])
    expect(returned(feeding, 'supply')).toEqual([`${a}:5`])
    expect(returned(feeding, 'home')).toEqual([`${a}:1`, `${a}:2`, `${a}:3`, `${a}:4`, `${b}:1`, `${b}:2`])
    expect(feeding.state.events.filter(event => event.type === 'guest.voided')).toEqual([])
    const home = feeding.state.players[0]!
    expect(home.workers.find(worker => worker.id === '5')).toEqual({ id: '5', isActive: false, isNewborn: false })
    expect(inactiveWorkersInSupply(home).map(worker => worker.id)).toEqual(['5'])
    expect(home.guests).toEqual([])
    expect(familySize(home)).toBe(4)

    // The harvest asks A for four people's food.
    expect(feeding.state.roundPhase).toBe('feeding')
    expect(feeding.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed', remaining: 8 } })

    // Next round the token in A's supply is Motivator's to offer again, and A has no Guest.
    let next = feeding
    for (const playerIndex of [0, 1]) {
      expect(next.interaction).toMatchObject({ stateId: 'wait', playerIndex, request: { kind: 'feed' } })
      next = session.resolveChoice(playerIndex, 'confirm', { selections: [] })
      expect(next.ok, next.error).toBe(true)
    }
    expect(next.state.round).toBe(HARVEST_ROUND + 1)
    expect(next.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(placementOptions(next)).toEqual([ORDINARY, SUPPLY_PERSON])
    expect(next.state.players[0]!.guests).toEqual([])
  })
})

describe('Guest recalled by a revised card', () => {
  it('is returned home from Grain Utilization by Tea Time, is not offered again that round and leaves at return home', () => {
    // A round without a harvest, in which Grain Utilization and the improvement space are long revealed.
    const round = 6
    const session = setup(round, (state) => {
      const owner = state.players[0]!
      owner.minorHand = [TEA_TIME]
      // One grain for the Guest to sow, one food to pay for Tea Time.
      Object.assign(owner.resources, { food: 1, grain: 1 })
    })
    const [a, b] = session.state.players.map(player => player.id)

    // The Guest uses Grain Utilization and sows A's grain.
    exchange(session)
    const sowing = dispatchGuest(session, 'grain-utilization')
    expect(sowing.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select' } })
    const sown = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
    expect(sown.ok, sown.error).toBe(true)
    expect(space(sown, 'grain-utilization').takenBy).toEqual([{ playerId: a, workerId: 'guest:1', guest: true }])
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    act(session, 1, 'forest')

    // A plays Tea Time, its only improvement. The Guest is A's person on Grain Utilization, so it returns home.
    expect(confirmNextPlayer(session).interaction.stateId).toBe('idle')
    const recalled = act(session, 0, 'major-improvement')
    expect(recalled.state.players[0]!.resources.food).toBe(0)
    expect(recalled.state.players[1]!.minorHand).toContain(TEA_TIME)
    expect(space(recalled, 'grain-utilization').takenBy).toEqual([])
    expect(recalled.state.players[0]!.guests).toEqual([
      { id: 'guest:1', sourceCardId: ANIMAL_FARM, round, dispatched: true },
    ])
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    act(session, 1, 'clay-pit')

    // A Guest is dispatched once: back at A there is only its last family member to place.
    const back = confirmNextPlayer(session)
    expect(back.state.currentPlayerIndex).toBe(0)
    expect(back.interaction.stateId).toBe('idle')
    expect(workersAvailable(back.state, back.state.players[0]!)).toBe(1)
    const last = act(session, 0, 'reed-bank')
    expect(getRoundPersonPlacementDetails(last.state.players[0]!)).toEqual([
      { spaceId: 'grain-utilization', workerId: 'guest:1' },
      { spaceId: 'major-improvement', workerId: '1' },
      { spaceId: 'reed-bank', workerId: '2' },
    ])

    // The recalled Guest does not keep the work phase open. It leaves at return home, used and not void.
    const next = confirmNextPlayer(session)
    expect(next.state.round).toBe(round + 1)
    expect(next.state.players[0]!.guests).toEqual([])
    expect(next.state.events.filter(event => event.type === 'guest.voided')).toEqual([])
    expect(returned(next, 'home')).toEqual([`${a}:1`, `${a}:2`, `${b}:1`, `${b}:2`])
  })
})

describe('Guest next to a revised card that ends the work phase on the last action space', () => {
  const STEAM_MACHINE = 'C025_SteamMachine'

  it('keeps Steam Machine from firing or consuming the Guest while it is pending, and fires on the Guest\'s accumulation space', () => {
    const session = createWorkSession({ seed: 62, configure(state) {
      state.round = 6
      for (const player of state.players) {
        player.minorHand = [PLACEHOLDER]
        player.occupationHand = [PLACEHOLDER]
        player.minorPlayed = []
        player.occupationPlayed = []
        setActiveWorkerCount(player, 1)
      }
      const owner = state.players[0]!
      owner.minorPlayed = [ANIMAL_FARM, STEAM_MACHINE]
      owner.improvements = ['Major_Fireplace1']
      fillFarm(owner)
      owner.resources.grain = 1
    } })
    sessions.push(session)
    const a = session.state.players[0]!.id

    // A takes a Guest, then places the last family member on an accumulation space first.
    exchange(session)
    const placed = takeNormalWorkerTurn(session, 'forest')
    expect(placed.ok, placed.error).toBe(true)
    expect(workersAvailable(placed.state, placed.state.players[0]!)).toBe(0)
    // The Guest is still to come, so Forest is not A's last action space: no bake, nothing consumed.
    expect(placed.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player' } })
    expect(placed.state.players[0]!.resources.grain).toBe(1)
    expect(placed.state.players[0]!.guests).toEqual([{ id: 'guest:1', sourceCardId: ANIMAL_FARM, round: 6 }])
    expect(placed.state.players[0]!._extraTurnConsumedCountsByCard?.['guest:1'] ?? 0).toBe(0)

    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    act(session, 1, 'clay-pit')
    const guestTurn = confirmNextPlayer(session)
    expect(guestTurn.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })

    // The Guest's Reed Bank is A's last action space: Steam Machine offers its Bake Bread now.
    const last = dispatchGuest(session, 'reed-bank')
    expect(space(last, 'reed-bank').takenBy).toEqual([{ playerId: a, workerId: 'guest:1', guest: true }])
    expect(last.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: STEAM_MACHINE })
  })

  it('fires Steam Machine when the last family member takes the only space the pending Guest could use', () => {
    const session = createWorkSession({ seed: 62, configure(state) {
      state.round = 6
      for (const player of state.players) {
        player.minorHand = [PLACEHOLDER]
        player.occupationHand = [PLACEHOLDER]
        player.minorPlayed = []
        player.occupationPlayed = []
        setActiveWorkerCount(player, 1)
      }
      const owner = state.players[0]!
      owner.minorPlayed = [STEAM_MACHINE]
      owner.improvements = ['Major_Fireplace1']
      owner.resources.grain = 1
    } })
    sessions.push(session)
    // A pending Guest whose only space is Forest; loading it offers A the Guest or a family member.
    const state = session.state
    state.players[0]!.guests = [{ id: 'guest:1', sourceCardId: ANIMAL_FARM, round: 6, where: { kind: 'spaces', spaceIds: ['forest'] } }]
    expect(session.loadState(state).ok).toBe(true)

    // Forest was the Guest's only space, so the Guest cannot follow and Forest is A's last action space.
    const placed = takeNormalWorkerTurn(session, 'forest')
    expect(placed.ok, placed.error).toBe(true)
    expect(workersAvailable(placed.state, placed.state.players[0]!)).toBe(0)
    expect(placed.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: STEAM_MACHINE })
    expect(placed.state.players[0]!.guests).toEqual([
      { id: 'guest:1', sourceCardId: ANIMAL_FARM, round: 6, where: { kind: 'spaces', spaceIds: ['forest'] } },
    ])
  })
})
