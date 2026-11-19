import { afterEach, describe, expect, it } from 'vitest'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { hasPendingExtraTurn, skipPendingExtraTurn } from '../../shared/cards/card-effects'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import { grantGuestLeaf, grantImmediateGuestLeaf } from '../../shared/cards/helpers/guest-flow'
import { getRoundPersonPlacementDetails, getRoundPersonPlacementOrder } from '../../shared/cards/helpers/round-placement'
import type { ActionFlow, GameState, GuestRecord } from '../../shared/contract/types'
import { familySize, markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'

// The Guest mechanism without any Guest card: the scenarios put records straight into the state.
// Their source cards are not in play, because a granted Guest belongs to the player, not to its card.
const SOURCE = 'CI073_Guest'
const OTHER_SOURCE = 'CZ314_Keg'
const GIVER = '__TEST_guest_giver__'
const PLACEHOLDER = '__test_placeholder__'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

type GuestSeed = Partial<GuestRecord> & Pick<GuestRecord, 'id'>

const give = (state: GameState, playerIndex: number, ...seeds: GuestSeed[]) => {
  state.players[playerIndex]!.guests = seeds.map(seed => ({ sourceCardId: SOURCE, round: state.round, ...seed }))
}

/** A new 2-player game in the work phase with A (seat 0) to move, then `inject` applied and the state loaded. */
function setup(inject: (state: GameState) => void) {
  const session = createWorkSession({ seed: 62, configure(state) {
    for (const player of state.players) {
      player.minorHand = [PLACEHOLDER]
      player.occupationHand = [PLACEHOLDER]
      player.minorPlayed = []
      player.occupationPlayed = []
    }
  } })
  sessions.push(session)
  const state = session.getState().state
  expect(state.currentPlayerIndex).toBe(0)
  inject(state)
  const loaded = session.loadState(state)
  expect(loaded.ok, loaded.error).toBe(true)
  return session
}

/** Gives A a test card whose anytime action runs `flow`. */
function withGiver(session: GameSession, flow: (context: CardListenerContext) => ActionFlow) {
  session.withCtx(() => requireActiveCardRegistry('guest mechanism test').registerListener({
    id: GIVER,
    cardIds: [GIVER],
    actions: ['anytime'],
    phases: ['anytime'],
    handler: context => ({ sourceCard: GIVER, flow: flow(context) }),
  }))
}

function restore(session: GameSession) {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.push(restored)
  return restored
}

const choiceLabels = (response: SessionResponse) => getChoiceOptions(response).map(option => option.labelKey)
const choiceValues = (response: SessionResponse) => getChoiceOptions(response).map(option => option.value)
const offeredGuests = (response: SessionResponse) =>
  getChoiceOptions(response).flatMap(option => typeof option.labelParams?.guestId === 'string' ? [option.labelParams.guestId] : [])
const space = (response: SessionResponse, spaceId: string) =>
  response.state.actionSpaces.find(candidate => candidate.id === spaceId)!
const facts = (response: SessionResponse, type: 'guest.granted' | 'guest.voided') =>
  response.state.events.filter(event => event.type === type)

/** Picks `guestId` (ids are per player) in the pending choice; the next prompt is its choice of space. */
function chooseGuest(session: GameSession, guestId: string) {
  const pending = session.getState()
  const option = getChoiceOptions(pending).find(candidate => candidate.labelParams?.guestId === guestId)
  expect(option, `${guestId} is offered`).toBeDefined()
  const playerIndex = pending.interaction.stateId === 'wait' ? pending.interaction.playerIndex : -1
  const targets = session.resolveChoice(playerIndex, option!.value)
  expect(targets.ok, targets.error).toBe(true)
  expect(targets.interaction).toMatchObject({ stateId: 'wait', playerIndex, promptKey: 'ui.interactionPlaceFarmerExtra' })
  return targets
}

function dispatch(session: GameSession, guestId: string, spaceId: string) {
  const targets = chooseGuest(session, guestId)
  const playerIndex = targets.interaction.stateId === 'wait' ? targets.interaction.playerIndex : -1
  const placed = session.resolveChoice(playerIndex, spaceId)
  expect(placed.ok, placed.error).toBe(true)
  return placed
}

describe('Guest rounds', () => {
  it('keeps a Guest booked for a later round out of this round and offers it when its round comes', () => {
    let session = setup(state => give(state, 0, { id: 'guest:1', round: state.round + 1 }))
    const booked = { id: 'guest:1', sourceCardId: SOURCE, round: 2 }

    // Round 1: nothing is offered, also after a save and restore, and return home leaves the booking alone.
    expect(session.getState().interaction.stateId).toBe('idle')
    expect(session.withCtx(() => hasPendingExtraTurn(session.state, session.state.players[0]!, session.actionHooks))).toBe(false)
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    session = restore(session)
    expect(session.state.players[0]!.guests).toEqual([booked])
    for (const [playerIndex, spaceId] of [[1, 'day-laborer'], [0, 'clay-pit'], [1, 'reed-bank']] as const) {
      expect(session.getState().interaction.stateId).toBe('idle')
      expect(session.takeAction(playerIndex, spaceId).ok).toBe(true)
      expect(confirmNextPlayer(session).ok).toBe(true)
    }
    const arrived = session.getState()
    expect(arrived.state.round).toBe(2)
    expect(arrived.state.players[0]!.guests).toEqual([booked])
    expect(facts(arrived, 'guest.voided')).toEqual([])

    // Round 2: the Guest joins A's choice, also after the game is saved and restored.
    expect(arrived.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(choiceLabels(arrived)).toEqual(['actions.place-farmer.name', 'actions.activate-extra-turn.name'])
    expect(offeredGuests(arrived)).toEqual(['guest:1'])
    session = restore(session)
    expect(session.getState().interaction).toEqual(arrived.interaction)
    const placed = dispatch(session, 'guest:1', 'forest')
    expect(placed.state.players[0]!.guests).toEqual([{ ...booked, dispatched: true }])
  })
})

describe('Guest placement scope', () => {
  it('sends a Guest limited to named spaces only there, and never offers it while none of them is free', () => {
    const session = setup(state => give(state, 0, { id: 'guest:1', where: { kind: 'spaces', spaceIds: ['fishing', 'day-laborer'] } }))

    expect(choiceValues(chooseGuest(session, 'guest:1'))).toEqual(['fishing', 'day-laborer'])
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'forest'))
    expect(session.resolveChoice(0, 'day-laborer').ok).toBe(true)
    expect(space(session.getState(), 'day-laborer').takenBy[0]).toMatchObject({ workerId: 'guest:1', guest: true })
  })

  it('voids at return home a Guest that had no space to go to', () => {
    const session = setup((state) => {
      give(state, 0, { id: 'guest:1', where: { kind: 'spaces', spaceIds: ['fishing'] } })
      state.actionSpaces.find(candidate => candidate.id === 'fishing')!.takenBy = [{ playerId: state.players[1]!.id, workerId: '1' }]
      setActiveWorkerCount(state.players[0]!, 1)
    })
    const a = session.state.players[0]!.id

    expect(session.takeAction(0, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)

    // A's people are placed but Fishing is taken: there is no turn to offer, so the round ends.
    const next = confirmNextPlayer(session)
    expect(next.state.round).toBe(2)
    expect(next.state.players[0]!.guests).toEqual([])
    expect(facts(next, 'guest.voided')).toEqual([expect.objectContaining({ playerId: a, guestId: 'guest:1', cardId: SOURCE, round: 1 })])
    expect(getRoundPersonPlacementOrder(next.state.players[0]!)).toEqual([])
  })

  it('sends a Guest limited to accumulation spaces only to spaces that gain goods each round', () => {
    const session = setup(state => give(state, 0, { id: 'guest:1', where: { kind: 'accumulation' } }))
    const ordinary = session.getActionAvailability(0)
    expect(ordinary).toMatchObject({ 'day-laborer': true, 'grain-seeds': true, farmland: true, 'meeting-place': true })

    expect(choiceValues(chooseGuest(session, 'guest:1'))).toEqual(['forest', 'clay-pit', 'reed-bank', 'fishing'])
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'day-laborer'))
    const placed = session.resolveChoice(0, 'clay-pit')
    expect(placed.ok, placed.error).toBe(true)
    expect(placed.state.players[0]!.resources.clay).toBe(1)
  })
})

describe('Guest grants from a card flow', () => {
  it('grants a Guest for the current round by default and offers it at once', () => {
    const session = setup((state) => { state.players[0]!.minorPlayed = [GIVER] })
    withGiver(session, () => grantGuestLeaf(GIVER))
    const a = session.state.players[0]!.id

    const granted = session.takeAnytimeAction(0, GIVER)
    expect(granted.ok, granted.error).toBe(true)
    expect(granted.state.players[0]!.guests).toEqual([{ id: 'guest:1', sourceCardId: GIVER, round: 1 }])
    expect(facts(granted, 'guest.granted')).toEqual([expect.objectContaining({
      actorPlayerId: a, playerId: a, guestId: 'guest:1', cardId: GIVER, targetRound: 1,
    })])
    expect(offeredGuests(granted)).toEqual(['guest:1'])
  })

  it('grants a Guest with the round and scope the card asks for', () => {
    const session = setup((state) => { state.players[0]!.minorPlayed = [GIVER] })
    withGiver(session, ({ state }) => ({
      type: 'seq',
      children: [
        grantGuestLeaf(GIVER, { round: state.round + 2, where: { kind: 'accumulation' } }),
        grantGuestLeaf(GIVER, { where: { kind: 'spaces', spaceIds: ['fishing'] } }),
      ],
    }))

    const granted = session.takeAnytimeAction(0, GIVER)
    expect(granted.ok, granted.error).toBe(true)
    expect(granted.state.players[0]!.guests).toEqual([
      { id: 'guest:1', sourceCardId: GIVER, round: 3, where: { kind: 'accumulation' } },
      { id: 'guest:2', sourceCardId: GIVER, round: 1, where: { kind: 'spaces', spaceIds: ['fishing'] } },
    ])
    expect(facts(granted, 'guest.granted').map(event => event.type === 'guest.granted' && [event.guestId, event.targetRound]))
      .toEqual([['guest:1', 3], ['guest:2', 1]])
    // Only this round's Guest joins A's choice, next to an ordinary placement.
    expect(granted.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(offeredGuests(granted)).toEqual(['guest:2'])
  })

  it.each([
    ['a past round', { round: 0 }],
    ['a malformed scope', { where: { kind: 'spaces' } }],
  ] as const)('refuses a grant with %s', (_label, options) => {
    const session = setup((state) => { state.players[0]!.minorPlayed = [GIVER] })
    withGiver(session, () => ({ type: 'leaf', actionId: 'guest', sourceCard: GIVER, params: { operation: 'grant', ...options } }))

    session.takeAnytimeAction(0, GIVER)
    expect(session.state.players[0]!.guests ?? []).toEqual([])
    expect(facts(session.getState(), 'guest.granted')).toEqual([])
  })

  it('dispatches a Guest at once when the card says so: it is a real placement and returns at return home', () => {
    const session = setup((state) => {
      state.players[0]!.minorPlayed = [GIVER]
      markAllWorkersUsed(state, state.players[1]!)
    })
    const where = { kind: 'spaces' as const, spaceIds: ['fishing', 'day-laborer'] }
    withGiver(session, () => grantImmediateGuestLeaf(GIVER, { where }))
    const a = session.state.players[0]!.id
    const food = session.state.players[0]!.resources.food
    const fish = space(session.getState(), 'fishing').resources.food

    const targets = session.takeAnytimeAction(0, GIVER)
    expect(targets.ok, targets.error).toBe(true)
    expect(targets.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionPlaceFarmerExtra' })
    expect(choiceValues(targets)).toEqual(['fishing', 'day-laborer'])
    expect(targets.state.players[0]!.guests).toEqual([{
      id: 'guest:1', sourceCardId: GIVER, round: 1, where,
    }])

    const placed = session.resolveChoice(0, 'fishing')
    expect(placed.ok, placed.error).toBe(true)
    expect(placed.state.players[0]!.guests).toEqual([{
      id: 'guest:1', sourceCardId: GIVER, round: 1, where, dispatched: true,
    }])
    expect(space(placed, 'fishing').takenBy).toEqual([{ playerId: a, workerId: 'guest:1', guest: true }])
    expect(placed.state.players[0]!.resources.food).toBe(food + fish)
    expect(getRoundPersonPlacementDetails(placed.state.players[0]!)).toEqual([{ spaceId: 'fishing', workerId: 'guest:1' }])
    expect(facts(placed, 'guest.granted')).toEqual([expect.objectContaining({ playerId: a, guestId: 'guest:1', cardId: GIVER, targetRound: 1 })])
    expect(placed.state.events.filter(event => event.type === 'worker.placed').at(-1)).toMatchObject({ workerId: 'guest:1', spaceId: 'fishing' })

    // The card placed it outside A's turns: A still has both ordinary turns, and no Guest is offered.
    expect(placed.interaction.stateId).toBe('idle')
    expect(familySize(placed.state.players[0]!)).toBe(2)
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).interaction.stateId).toBe('idle')
    expect(session.takeAction(0, 'clay-pit').ok).toBe(true)
    const next = confirmNextPlayer(session)
    expect(next.state.round).toBe(2)
    expect(next.state.players[0]!.guests).toEqual([])
    expect(facts(next, 'guest.voided')).toEqual([])
  })

  it('places an immediate Guest without asking when its scope leaves a single space', () => {
    const session = setup((state) => { state.players[0]!.minorPlayed = [GIVER] })
    withGiver(session, () => grantImmediateGuestLeaf(GIVER, { where: { kind: 'spaces', spaceIds: ['fishing'] } }))

    const placed = session.takeAnytimeAction(0, GIVER)
    expect(placed.ok, placed.error).toBe(true)
    expect(space(placed, 'fishing').takenBy).toEqual([{ playerId: placed.state.players[0]!.id, workerId: 'guest:1', guest: true }])
    expect(placed.state.players[0]!.guests).toHaveLength(1)
    expect(placed.interaction.stateId).toBe('idle')
  })

  it('voids an immediate Guest that has no legal space and keeps the other card reward', () => {
    const session = setup((state) => {
      state.players[0]!.minorPlayed = [GIVER]
      state.actionSpaces.find(candidate => candidate.id === 'fishing')!.takenBy = [{ playerId: state.players[1]!.id, workerId: '1' }]
    })
    withGiver(session, () => ({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'gain', sourceCard: GIVER, params: { food: 3 } },
        grantImmediateGuestLeaf(GIVER, { where: { kind: 'spaces', spaceIds: ['fishing'] }, optional: true }),
      ],
    }))
    const food = session.state.players[0]!.resources.food

    const response = session.takeAnytimeAction(0, GIVER)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(food + 3)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.guests ?? []).toEqual([])
    expect(facts(response, 'guest.granted')).toHaveLength(1)
    expect(facts(response, 'guest.voided')).toHaveLength(1)
  })

  it('voids an immediate Guest when the player declines optional dispatch', () => {
    const session = setup((state) => { state.players[0]!.minorPlayed = [GIVER] })
    withGiver(session, () => grantImmediateGuestLeaf(GIVER, { optional: true }))

    const prompt = session.takeAnytimeAction(0, GIVER)
    expect(prompt.ok, prompt.error).toBe(true)
    const decline = getChoiceOptions(prompt).find(option => option.labelKey === 'ui.interactionDecline')
    expect(decline).toBeDefined()
    const skipped = session.resolveChoice(0, decline!.value)
    expect(skipped.ok, skipped.error).toBe(true)
    expect(skipped.interaction.stateId).toBe('idle')
    expect(skipped.state.players[0]!.guests ?? []).toEqual([])
    expect(skipped.state.actionSpaces.flatMap(candidate => candidate.takenBy)).toEqual([])
    expect(facts(skipped, 'guest.granted')).toHaveLength(1)
    expect(facts(skipped, 'guest.voided')).toHaveLength(1)
  })
})

describe('Guests among other extra turns and people', () => {
  it('lets the owner pick among several Guests when no family member is left', () => {
    const session = setup((state) => {
      give(state, 0, { id: 'guest:1' }, { id: 'guest:2', sourceCardId: OTHER_SOURCE })
      for (const player of state.players) markAllWorkersUsed(state, player)
    })

    const offered = session.getState()
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(getChoiceOptions(offered).map(option => option.labelParams)).toEqual([
      { guestId: 'guest:1', guestCardId: SOURCE },
      { guestId: 'guest:2', guestCardId: OTHER_SOURCE },
    ])

    // Picking one opens its own last chance: dispatch it or decline it.
    const second = getChoiceOptions(offered)[1]!
    const lastChance = session.resolveChoice(0, second.value)
    expect(lastChance.ok, lastChance.error).toBe(true)
    expect(choiceLabels(lastChance)).toEqual(['actions.activate-extra-turn.name', 'ui.interactionDecline'])
    dispatch(session, 'guest:2', 'forest')

    const remaining = confirmNextPlayer(session)
    expect(offeredGuests(remaining)).toEqual(['guest:1'])
    expect(choiceLabels(remaining)).toEqual(['actions.activate-extra-turn.name', 'ui.interactionDecline'])
  })

  it('offers a Guest next to a revised card that places a person from the player\'s own supply', () => {
    const GUEST_ROOM = 'E022_GuestRoom'
    const session = setup((state) => {
      give(state, 0, { id: 'guest:1' })
      const owner = state.players[0]!
      owner.minorPlayed = [GUEST_ROOM]
      owner.cardStates[GUEST_ROOM] = { stack: ['food'] }
      markAllWorkersUsed(state, state.players[1]!)
    })

    const offered = session.getState()
    expect(getChoiceOptions(offered).map(option => [option.labelKey, option.sourceCard ?? option.labelParams?.guestId])).toEqual([
      ['actions.place-farmer.name', undefined],
      ['actions.activate-extra-turn.name', GUEST_ROOM],
      ['actions.activate-extra-turn.name', 'guest:1'],
    ])
    dispatch(session, 'guest:1', 'forest')

    // The Supply Person is still A's to use, and it comes from A's own five tokens while the Guest does not.
    const again = confirmNextPlayer(session)
    expect(getChoiceOptions(again).map(option => option.sourceCard ?? option.labelParams?.guestId ?? option.labelKey))
      .toEqual(['actions.place-farmer.name', GUEST_ROOM])
    const supply = getChoiceOptions(again).find(option => option.sourceCard === GUEST_ROOM)!
    expect(session.resolveChoice(0, supply.value).ok).toBe(true)
    const placed = session.resolveChoice(0, 'clay-pit')
    expect(placed.ok, placed.error).toBe(true)
    expect(space(placed, 'clay-pit').takenBy).toEqual([{ playerId: placed.state.players[0]!.id, workerId: '3' }])
    expect(space(placed, 'forest').takenBy).toEqual([{ playerId: placed.state.players[0]!.id, workerId: 'guest:1', guest: true }])
    expect(placed.state.players[0]!.workers.find(worker => worker.id === '3')?.supplyUse?.status).toBe('temporary')
    expect(familySize(placed.state.players[0]!)).toBe(2)
  })

  it('counts a mandatory turn skip against the Guest, which is then void at return home', () => {
    const session = setup((state) => {
      give(state, 0, { id: 'guest:1' })
      for (const player of state.players) markAllWorkersUsed(state, player)
    })
    const state = session.state
    const owner = state.players[0]!
    expect(session.withCtx(() => hasPendingExtraTurn(state, owner, session.actionHooks))).toBe(true)
    expect(session.buildSyncPayload(session.getState(), []).state.players[0]!.playerPanelSummary.guests).toEqual({ pending: 1 })

    expect(session.withCtx(() => skipPendingExtraTurn(state, owner, session.actionHooks))).toBe(true)

    expect(owner._extraTurnSkipCountsByCard).toEqual({ 'guest:1': 1 })
    expect(session.withCtx(() => hasPendingExtraTurn(state, owner, session.actionHooks))).toBe(false)
    expect(owner.guests).toHaveLength(1)
    expect(session.buildSyncPayload(session.getState(), []).state.players[0]!.playerPanelSummary.guests).toBeUndefined()
  })

  it('lets a card that allows a space occupied by one other person treat a Guest as that person', () => {
    const SLEEPING_CORNER = 'A026_SleepingCorner'
    const session = setup((state) => {
      state.round = 6
      give(state, 0, { id: 'guest:1', dispatched: true })
      const [owner, other] = state.players
      state.actionSpaces.find(candidate => candidate.id === 'wish-children')!.takenBy = [{ playerId: owner!.id, workerId: 'guest:1', guest: true }]
      markAllWorkersUsed(state, owner!)
      other!.minorPlayed = [SLEEPING_CORNER]
      other!.roomTiles = [...other!.roomTiles, { row: 0, col: 0 }]
      other!.rooms = 3
      state.currentPlayerIndex = 1
    })

    expect(session.getActionAvailability(1)['wish-children']).toBe(true)
    const grown = session.takeAction(1, 'wish-children')
    expect(grown.ok, grown.error).toBe(true)
    expect(familySize(grown.state.players[1]!)).toBe(3)
  })
})
