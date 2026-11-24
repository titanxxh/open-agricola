import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { setActiveWorkerCount } from '../../shared/domain/player'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'
import { getChoiceOptions } from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'
import { buyMinor } from './_helpers/standard-solo-cards'
import { takeNormalWorkerTurn } from './_helpers/supply-worker-turn'

const KEG = 'CZ314_Keg'
const ANIMAL_FARM = 'CG062_AnimalFarm'
const PLACEHOLDER = '__test_placeholder__'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup(configure?: (state: GameState) => void, options: { playerCount?: 1 | 2; enableSnakeOpening?: boolean } = {}) {
  // Seed 1 opens Major Improvement in round 1.
  const session = createWorkSession({ seed: 1, options, configure(state) {
    for (const player of state.players) {
      player.minorHand = [PLACEHOLDER]
      player.occupationHand = [PLACEHOLDER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources.wood = 1
    }
    state.players[0]!.minorHand = [KEG, PLACEHOLDER]
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function playKeg(session: GameSession, playerIndex: number, spaceId = 'meeting-place') {
  const before = session.getState().state.players[playerIndex]!
  expect(before.minorHand).toContain(KEG)
  expect(before.resources.wood).toBe(1)
  const played = buyMinor(session, KEG, playerIndex, spaceId)
  const player = played.state.players[playerIndex]!
  expect(player.resources.wood).toBe(0)
  expect(player.minorPlayed).not.toContain(KEG)
  expect(played.state.events).toContainEqual(expect.objectContaining({
    type: 'resource.paid', sourceCardId: KEG, resources: { wood: 1 }, actorPlayerId: player.id,
  }))
  // The Guest comes in the work-end window; until then only the round is noted on the buyer's card state.
  expect(player.guests ?? []).toEqual([])
  expect(player.cardStates[KEG]?.extraData).toMatchObject({ playedRound: played.state.round })
  expect(played.state.events.some(event => event.type === 'guest.granted')).toBe(false)
  return played
}

const guestSources = (response: SessionResponse) =>
  getChoiceOptions(response).flatMap(option => option.labelParams?.guestCardId ?? [])
const actionSpace = (response: SessionResponse, spaceId: string) =>
  response.state.actionSpaces.find(space => space.id === spaceId)!

function nextTurn(session: GameSession) {
  const next = confirmNextPlayer(session)
  expect(next.ok, next.error).toBe(true)
  return next
}

function takeTurn(session: GameSession, playerIndex: number, spaceId: string) {
  const taken = session.takeAction(playerIndex, spaceId)
  expect(taken.ok, taken.error).toBe(true)
  return nextTurn(session)
}

/** The Guest's placement in `round`, read from the events: a work-end Guest acts and the round then ends at once. */
const guestPlacement = (response: SessionResponse, playerId: string, guestId: string, round = 1) =>
  response.state.events.find(event => event.type === 'worker.placed' && event.round === round
    && event.actorPlayerId === playerId && event.workerId === guestId)

function dispatch(session: GameSession, playerIndex: number, cardId: string, spaceId: string) {
  const option = getChoiceOptions(session.getState()).find(choice => choice.labelParams?.guestCardId === cardId)
  expect(option, `${cardId} offers a Guest`).toBeDefined()
  const targets = session.resolveChoice(playerIndex, option!.value)
  expect(targets.ok, targets.error).toBe(true)
  expect(targets.interaction).toMatchObject({ stateId: 'wait', playerIndex, promptKey: 'ui.interactionPlaceFarmerExtra' })
  const placed = session.resolveChoice(playerIndex, spaceId)
  expect(placed.ok, placed.error).toBe(true)
  return placed
}

describe('CZ314 Keg', () => {
  it('lets A fish with its Guest after B places the last family member', () => {
    const session = setup(state => setActiveWorkerCount(state.players[1]!, 3))
    const played = playKeg(session, 0)
    const owner = played.state.players[0]!
    expect(played.state.players[1]!.minorHand).toEqual([PLACEHOLDER, KEG])
    expect(guestSources(nextTurn(session))).toEqual([])
    expect(guestSources(takeTurn(session, 1, 'day-laborer'))).toEqual([])
    expect(guestSources(takeTurn(session, 0, 'clay-pit'))).toEqual([])
    const passed = takeTurn(session, 1, 'reed-bank')
    expect(passed.state.currentPlayerIndex).toBe(1)
    expect(passed.interaction.stateId).toBe('idle')
    expect(guestSources(passed)).toEqual([])

    // B placed the last family member: the work-end window offers A the Keg Guest, though B holds the card.
    const offered = takeTurn(session, 1, 'grain-seeds')
    expect(offered.state.roundPhase).toBe('work')
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: KEG })
    expect(guestSources(offered)).toEqual([KEG])
    expect(offered.state.players[0]!.guests).toEqual([{ id: 'guest:1', sourceCardId: KEG, round: 1 }])
    expect(offered.state.events.filter(event => event.type === 'guest.granted')).toEqual([expect.objectContaining({
      playerId: owner.id, guestId: 'guest:1', cardId: KEG, targetRound: 1,
    })])
    const fish = actionSpace(offered, 'fishing').resources.food
    expect(fish).toBeGreaterThan(0)
    const food = offered.state.players[0]!.resources.food
    const placed = dispatch(session, 0, KEG, 'fishing')
    expect(placed.state.players[0]!.resources.food).toBe(food + fish)
    expect(guestPlacement(placed, owner.id, 'guest:1')).toMatchObject({ spaceId: 'fishing' })
    expect(placed.state.events).toContainEqual(expect.objectContaining({
      type: 'actionSpace.useStarted', actorPlayerId: owner.id, spaceId: 'fishing',
      personUse: { workerId: 'guest:1', placementOrdinal: 3 },
    }))
    expect(placed.scores?.[0]?.categories.find(category => category.key === 'farmers'))
      .toMatchObject({ quantity: 2, total: 6 })

    // Nothing follows the work-end window: the round ends with the Guest's action.
    const next = placed
    expect(next.state.round).toBe(2)
    expect(next.state.players[1]!.minorHand).toContain(KEG)
    expect(next.state.players[0]!.guests).toEqual([])
    expect(actionSpace(next, 'fishing').takenBy).toEqual([])
    expect(guestSources(next)).toEqual([])
    expect(next.state.events.filter(event => event.type === 'guest.granted')).toHaveLength(1)
  })

  it('dispatches the Animal Farm Guest before the Guest granted by the passed Keg', () => {
    const session = setup(state => {
      const owner = state.players[0]!
      const room = owner.roomTiles[0]!
      owner.minorPlayed = [ANIMAL_FARM]
      owner.resources.sheep = 1
      owner.houseAnimals = { [`${room.row}-${room.col}`]: 'sheep' }
    })
    const played = playKeg(session, 0)

    expect(played.state.players[0]!.minorPlayed).toEqual([ANIMAL_FARM])
    expect(played.state.players[1]!.minorHand).toEqual([PLACEHOLDER, KEG])

    expect(guestSources(nextTurn(session))).toEqual([])
    const ownerTurn = takeTurn(session, 1, 'day-laborer')
    expect(ownerTurn.interaction.stateId).toBe('idle')
    const entry = ownerTurn.interaction.stateId === 'idle'
      ? ownerTurn.interaction.anytimeActions.find(action => action.sourceCard === ANIMAL_FARM)
      : undefined
    expect(entry).toBeDefined()
    const offered = session.takeAnytimeAction(0, entry!.id)
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.state.players[0]!.resources.sheep).toBe(0)
    expect(guestSources(offered)).toEqual([ANIMAL_FARM])

    expect(takeNormalWorkerTurn(session, 'clay-pit').ok).toBe(true)
    expect(guestSources(nextTurn(session))).toEqual([])
    expect(guestSources(takeTurn(session, 1, 'reed-bank'))).toEqual([ANIMAL_FARM])

    const farmGuest = dispatch(session, 0, ANIMAL_FARM, 'grain-seeds')
    expect(actionSpace(farmGuest, 'grain-seeds').takenBy[0]).toMatchObject({ workerId: 'guest:1', guest: true })
    expect(guestSources(nextTurn(session))).toEqual([KEG])
    const kegGuest = dispatch(session, 0, KEG, 'fishing')
    expect(guestPlacement(kegGuest, kegGuest.state.players[0]!.id, 'guest:2')).toMatchObject({ spaceId: 'fishing' })
    expect(kegGuest.state.round).toBe(2)
  })

  it('offers two Keg Guests in the work-end window from the start player and lets the other player decline', () => {
    const session = setup(state => setActiveWorkerCount(state.players[0]!, 3))
    const first = playKeg(session, 0, 'major-improvement')
    const [a, b] = first.state.players.map(player => player.id)
    expect(first.state.players[1]!.minorHand).toEqual([PLACEHOLDER, KEG])
    expect(first.state.players[1]!.guests).toBeUndefined()
    expect(nextTurn(session).state.currentPlayerIndex).toBe(1)
    const second = playKeg(session, 1)
    expect(second.state.round).toBe(1)
    expect(second.state.roundFirstPlayerId).toBe(a)
    expect(second.state.players[1]!.startPlayer).toBe(true)
    expect(second.state.players[0]!.minorHand).toEqual([PLACEHOLDER, KEG])
    expect(second.state.players[1]!.minorHand).toEqual([PLACEHOLDER])
    expect(second.state.events.filter(event => event.type === 'card.passed' && event.cardId === KEG)).toEqual([
      expect.objectContaining({ fromPlayerId: a, toPlayerId: b, round: 1 }),
      expect.objectContaining({ fromPlayerId: b, toPlayerId: a, round: 1 }),
    ])
    expect(guestSources(nextTurn(session))).toEqual([])
    expect(guestSources(takeTurn(session, 0, 'clay-pit'))).toEqual([])

    expect(guestSources(takeTurn(session, 1, 'reed-bank'))).toEqual([])
    // A places the last family member; the work-end window starts with the start player, B (#2039).
    const offeredB = takeTurn(session, 0, 'forest')
    expect(offeredB.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1 })
    expect(guestSources(offeredB)).toEqual([KEG])
    const placed = dispatch(session, 1, KEG, 'fishing')
    expect(guestPlacement(placed, b, 'guest:1')).toMatchObject({ spaceId: 'fishing' })
    // The window hands over to A.
    expect(placed.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-player-switch', fromPlayerIndex: 1, toPlayerIndex: 0 } })
    const offeredA = confirmPlayerSwitch(session)
    expect(offeredA.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(guestSources(offeredA)).toEqual([KEG])
    const decline = getChoiceOptions(offeredA).find(option => option.labelKey === 'ui.interactionDecline')
    expect(decline).toBeDefined()
    const declined = session.resolveChoice(0, decline!.value)
    expect(declined.ok, declined.error).toBe(true)
    const voided = expect.objectContaining({
      type: 'guest.voided', playerId: a, guestId: 'guest:1', cardId: KEG,
    })
    expect(declined.state.events.filter(event => event.type === 'guest.voided')).toEqual([voided])

    const next = declined
    expect(next.state.round).toBe(2)
    expect(next.state.players.map(player => player.guests)).toEqual([[], []])
  })

  it('keeps a Guest for each purchase when Keg comes back and A buys it again before the work-end window', () => {
    const session = setup(state => {
      Object.assign(state.players[0]!.resources, { wood: 2, clay: 2, reed: 1 })
      state.players[0]!.houseType = 'wood'
      state.actionSpaces.find(space => space.id === 'house-redevelopment')!.roundAvailable = 1
    })
    const [a, b] = session.state.players.map(player => player.id)
    buyMinor(session, KEG, 0, 'meeting-place')
    nextTurn(session)
    // B buys the passed Keg and passes it back to A.
    const back = buyMinor(session, KEG, 1, 'major-improvement')
    expect(back.state.players[0]!.minorHand).toContain(KEG)
    nextTurn(session)
    let response = session.takeAction(0, 'house-redevelopment')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = session.resolveChoice(0, 'clay')
    }
    // After renovating, House Redevelopment offers its optional improvement.
    const improvement = getChoiceOptions(response).find(option => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
    // Keg is the only affordable minor, so the purchase may need no further choice.
    const minor = getChoiceOptions(response).find(option => option.value === KEG || option.value === `minor:${KEG}`)
    const rebought = minor ? session.resolveChoice(0, minor.value) : response
    expect(rebought.ok, rebought.error).toBe(true)
    expect(rebought.state.players[0]!.minorHand).not.toContain(KEG)
    expect(rebought.state.players[0]!.resources.wood).toBe(0)
    expect(rebought.state.players[0]!.cardStates[KEG]?.extraData).toMatchObject({ playedRound: 1, guests: 2 })

    nextTurn(session)
    // B places the last family member: the window places both of A's Keg Guests, then B's.
    const window = takeTurn(session, 1, 'day-laborer')
    expect(window.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(guestSources(window)).toEqual([KEG])
    dispatch(session, 0, KEG, 'fishing')
    const second = dispatch(session, 0, KEG, 'forest')
    expect(second.state.events.filter(event => event.type === 'guest.granted' && event.playerId === a)).toHaveLength(2)
    expect(nextTurn(session).interaction).toMatchObject({ stateId: 'wait', playerIndex: 1 })
    const last = dispatch(session, 1, KEG, 'clay-pit')
    expect(guestPlacement(last, a, 'guest:1')).toMatchObject({ spaceId: 'fishing' })
    expect(guestPlacement(last, a, 'guest:2')).toMatchObject({ spaceId: 'forest' })
    expect(guestPlacement(last, b, 'guest:1')).toMatchObject({ spaceId: 'clay-pit' })
    expect(last.state.round).toBe(2)
  })

  it('places the Guest at once when a Monastic Vows Guest buys Keg in the work-end window, then ends the round', () => {
    const MONASTIC_VOWS = 'CNL017_MonasticVows'
    const session = setup(state => {
      state.players[0]!.minorPlayed = [MONASTIC_VOWS]
      setActiveWorkerCount(state.players[0]!, 1)
      setActiveWorkerCount(state.players[1]!, 1)
    })
    const [a] = session.state.players.map(player => player.id)
    const window = takeTurn(session, 0, 'forest')
    expect(window.state.currentPlayerIndex).toBe(1)
    const ended = takeTurn(session, 1, 'clay-pit')

    // The work-end window: A accepts Monastic Vows and must place its Guest at once.
    expect(ended.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    const vows = getChoiceOptions(ended).find(option => option.sourceCard === MONASTIC_VOWS)
    expect(vows, JSON.stringify(ended.interaction)).toBeDefined()
    const targets = session.resolveChoice(0, vows!.value)
    expect(targets.ok, targets.error).toBe(true)
    expect(targets.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionPlaceFarmerExtra' })
    let response = session.resolveChoice(0, 'meeting-place')
    expect(response.ok, response.error).toBe(true)
    // Meeting Place offers its minor improvement as the Guest's optional action.
    const branch = getChoiceOptions(response).find(option => option.value.startsWith('action-improvement-')
      || option.labelKey === 'actions.improvement.name')
    if (branch) response = session.resolveChoice(0, branch.value)
    expect(response.ok, response.error).toBe(true)
    // Keg is the only affordable minor, so the purchase may need no further choice.
    const minor = getChoiceOptions(response).find(option => option.value === KEG || option.value === `minor:${KEG}`)
    const bought = minor ? session.resolveChoice(0, minor.value) : response
    expect(bought.ok, bought.error).toBe(true)
    expect(bought.state.players[0]!.minorHand).not.toContain(KEG)

    // Everyone has already placed, so Keg's Guest is offered now rather than waiting for a turn that never comes.
    expect(bought.state.round).toBe(1)
    expect(bought.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(guestSources(bought)).toEqual([KEG])
    expect(bought.state.players[0]!.guests).toEqual([
      expect.objectContaining({ id: 'guest:1', sourceCardId: MONASTIC_VOWS, dispatched: true }),
      { id: 'guest:2', sourceCardId: KEG, round: 1 },
    ])
    const placed = dispatch(session, 0, KEG, 'fishing')
    expect(guestPlacement(placed, a, 'guest:2')).toMatchObject({ spaceId: 'fishing' })
    expect(placed.state.round).toBe(2)
    expect(placed.state.players[0]!.guests).toEqual([])
    expect(placed.state.events.filter(event => event.type === 'guest.voided')).toEqual([])
  })

  it('discards the passing card in solo play and still grants a dispatchable Guest', () => {
    const session = setup(undefined, { playerCount: 1 })
    const played = playKeg(session, 0)
    expect(played.state.players[0]!.minorHand).toEqual([PLACEHOLDER])
    expect(played.state.ordinaryCardDecks.minor).not.toContain(KEG)
    expect(played.state.events.filter(event => event.type === 'card.destroyed' && event.cardId === KEG))
      .toEqual([expect.objectContaining({ reason: 'passed', playerId: 'p1' })])
    expect(played.state.events.some(event => event.type === 'card.passed' && event.cardId === KEG)).toBe(false)

    expect(guestSources(nextTurn(session))).toEqual([])
    const offered = takeTurn(session, 0, 'reed-bank')
    expect(guestSources(offered)).toEqual([KEG])
    const fish = actionSpace(offered, 'fishing').resources.food
    expect(fish).toBeGreaterThan(0)
    const food = offered.state.players[0]!.resources.food
    const placed = dispatch(session, 0, KEG, 'fishing')
    expect(placed.state.players[0]!.resources.food).toBe(food + fish)
    expect(guestPlacement(placed, 'p1', 'guest:1')).toMatchObject({ spaceId: 'fishing' })
    const next = placed
    expect(next.state.round).toBe(2)
    expect(next.state.players[0]!.guests).toEqual([])
  })
})
