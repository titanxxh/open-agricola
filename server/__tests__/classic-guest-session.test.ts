import { afterEach, describe, expect, it } from 'vitest'
import { hasPendingExtraTurn } from '../../shared/cards/card-effects'
import type { GameState } from '../../shared/contract/types'
import { familySize } from '../../shared/domain/player'
import { filterSerializedStateForPlayer, rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { getChoiceOptions } from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'
import { buyMinor } from './_helpers/standard-solo-cards'
import { takeNormalWorkerTurn } from './_helpers/supply-worker-turn'

const GUEST = 'CI073_Guest'
const PLACEHOLDER = '__test_placeholder__'
/** What playing the card in round 3 leaves with A. */
const BOOKED = { id: 'guest:1', sourceCardId: GUEST, round: 4 }
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

/** A work phase with A to move and two family members per player. */
function setup(round = 3, configure?: (state: GameState) => void, playerCount: 1 | 2 = 2, seed = 73) {
  const session = createWorkSession({ seed, options: { playerCount }, configure(state) {
    state.round = round
    for (const player of state.players) {
      player.minorHand = [PLACEHOLDER]
      player.occupationHand = [PLACEHOLDER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources.food = 2
    }
    state.players[0]!.minorHand = [GUEST, PLACEHOLDER]
    configure?.(state)
  } })
  sessions.push(session)
  expect(session.state.currentPlayerIndex).toBe(0)
  return session
}

function playGuest(session: GameSession, seat = 0, spaceId = 'meeting-place') {
  const foodBefore = session.state.players[seat]!.resources.food
  const played = buyMinor(session, GUEST, seat, spaceId)
  const owner = played.state.players[seat]!
  expect(owner.minorPlayed).not.toContain(GUEST)
  expect(owner.resources.food).toBe(foodBefore - 2)
  expect(played.state.events).toContainEqual(expect.objectContaining({
    type: 'resource.paid', sourceCardId: GUEST, resources: { food: 2 }, actorPlayerId: owner.id,
  }))
  return played
}

const facts = (response: SessionResponse, type: 'guest.granted' | 'guest.voided') =>
  response.state.events.filter(event => event.type === type)
const choiceLabels = (response: SessionResponse) => getChoiceOptions(response).map(option => option.labelKey)
const guestOption = (response: SessionResponse) =>
  getChoiceOptions(response).find(option => typeof option.labelParams?.guestId === 'string')
const owesExtraTurn = (session: GameSession, playerIndex: number) =>
  session.withCtx(() => hasPendingExtraTurn(session.state, session.state.players[playerIndex]!, session.actionHooks))
const space = (response: SessionResponse, spaceId: string) =>
  response.state.actionSpaces.find(candidate => candidate.id === spaceId)!

/**
 * Finishes `round` after any Meeting Place purchase. Every turn has to be an ordinary one:
 * no Guest is offered and none is owed. Returns the hand-off that ends the round's work phase.
 */
function playRoundWithoutGuest(session: GameSession, round: number) {
  let handOff = session.getState()
  const turns = [[0, 'forest'], [1, 'day-laborer'], [0, 'clay-pit'], [1, 'reed-bank']] as const
  const afterPurchase = handOff.interaction.stateId === 'wait' && handOff.interaction.request.kind === 'confirm-next-player'
  if (afterPurchase) {
    handOff = confirmNextPlayer(session)
    expect(handOff.ok, handOff.error).toBe(true)
  }
  for (const [playerIndex, spaceId] of afterPurchase ? turns.slice(1) : turns) {
    const turn = session.getState()
    expect(turn.state.round).toBe(round)
    expect(turn.state.roundPhase).toBe('work')
    expect(turn.state.currentPlayerIndex).toBe(playerIndex)
    expect(turn.interaction.stateId).toBe('idle')
    expect(owesExtraTurn(session, playerIndex)).toBe(false)
    expect(session.takeAction(playerIndex, spaceId).ok).toBe(true)
    handOff = confirmNextPlayer(session)
    expect(handOff.ok, handOff.error).toBe(true)
  }
  return handOff
}

function restore(session: GameSession) {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.push(restored)
  return restored
}

/** Picks the Guest in A's pending placement choice and sends it to `spaceId`. */
function dispatchGuest(session: GameSession, spaceId: string) {
  const option = guestOption(session.getState())
  expect(option, 'the Guest is offered').toBeDefined()
  const targets = session.resolveChoice(0, option!.value)
  expect(targets.ok, targets.error).toBe(true)
  expect(targets.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionPlaceFarmerExtra' })
  const placed = session.resolveChoice(0, spaceId)
  expect(placed.ok, placed.error).toBe(true)
  return placed
}

describe('CI073 Guest', () => {
  it('gives A one Guest for the next round, with nothing to dispatch in the round it is played', () => {
    const session = setup()
    const a = session.state.players[0]!.id

    const played = playGuest(session)

    expect(played.state.round).toBe(3)
    expect(played.state.players[0]!.guests).toEqual([BOOKED])
    expect(played.state.players[1]!.guests ?? []).toEqual([])
    expect(played.state.players[1]!.minorHand).toContain(GUEST)
    expect(played.state.players[0]!.minorPlayed).not.toContain(GUEST)
    expect(facts(played, 'guest.granted')).toEqual([expect.objectContaining({
      actorPlayerId: a, playerId: a, guestId: 'guest:1', cardId: GUEST, targetRound: 4,
    })])
    // A used its first family member to buy the card. No Guest is offered in the hand-off.
    expect(played.state.currentPlayerIndex).toBe(0)
    expect(played.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(guestOption(played)).toBeUndefined()

    // Round 3 goes on as if A had no Guest and ends with the last family member.
    playRoundWithoutGuest(session, 3)
    const arrived = session.getState()
    expect(arrived.state.round).toBe(4)
    expect(arrived.state.players[0]!.guests).toEqual([BOOKED])
    expect(facts(arrived, 'guest.voided')).toEqual([])
  })

  it.each([
    { when: 'before either family member', guestTurn: 0, people: ['guest:1', '1', '2'] },
    { when: 'between the two family members', guestTurn: 1, people: ['1', 'guest:1', '2'] },
    { when: 'after the last family member', guestTurn: 2, people: ['1', '2', 'guest:1'] },
  ])('lets A dispatch the Guest in round 4 $when: three placements with two family members', ({ guestTurn, people }) => {
    const session = setup()
    const a = session.state.players[0]!.id
    playGuest(session)
    playRoundWithoutGuest(session, 3)
    const aSpaces = ['forest', 'clay-pit', 'fishing']
    const bSpaces = ['day-laborer', 'reed-bank']

    let handOff = session.getState()
    for (const [turn, spaceId] of aSpaces.entries()) {
      const offered = session.getState()
      expect(offered.state.round).toBe(4)
      expect(offered.state.currentPlayerIndex).toBe(0)
      // The Guest is offered on every turn of A until it is dispatched; afterwards A's turns are ordinary.
      expect(choiceLabels(offered)).toEqual(turn > guestTurn ? []
        : turn < 2 ? ['actions.place-farmer.name', 'actions.activate-extra-turn.name']
          : ['actions.activate-extra-turn.name', 'ui.interactionDecline'])
      if (turn === guestTurn) {
        expect(guestOption(offered)?.labelParams).toEqual({ guestId: 'guest:1', guestCardId: GUEST })
        const placed = dispatchGuest(session, spaceId)
        expect(space(placed, spaceId).takenBy).toEqual([{ playerId: a, workerId: 'guest:1', guest: true }])
        expect(placed.state.players[0]!.guests).toEqual([{ ...BOOKED, dispatched: true }])
      } else {
        expect(takeNormalWorkerTurn(session, spaceId).ok).toBe(true)
      }
      handOff = confirmNextPlayer(session)
      const reply = bSpaces[turn]
      if (!reply) continue
      expect(handOff.state.currentPlayerIndex).toBe(1)
      expect(handOff.interaction.stateId).toBe('idle')
      expect(session.takeAction(1, reply).ok).toBe(true)
      handOff = confirmNextPlayer(session)
    }

    // A placed one person more than the family has members; B placed its two.
    const owner = session.state.players[0]!
    expect(familySize(owner)).toBe(2)
    expect(owner.workers.map(worker => worker.id)).toEqual(['1', '2', '3', '4', '5'])
    const placements = session.state.events
      .flatMap(event => event.type === 'worker.placed' && event.round === 4 ? [[event.actorPlayerId, event.workerId, event.spaceId]] : [])
    expect(placements.filter(([playerId]) => playerId === a))
      .toEqual(people.map((workerId, turn) => [a, workerId, aSpaces[turn]]))
    expect(placements.filter(([playerId]) => playerId !== a).map(([, , spaceId]) => spaceId)).toEqual(bSpaces)

    // Return home: the Guest goes back to the general supply, not home with the family, and A has none left.
    const next = autoAdvanceRoundEnd(session, { initialResponse: handOff })
    expect(next.state.round).toBe(5)
    expect(next.state.roundPhase).toBe('work')
    expect(next.state.players[0]!.guests).toEqual([])
    expect(next.state.actionSpaces.flatMap(candidate => candidate.takenBy)).toEqual([])
    expect(facts(next, 'guest.voided')).toEqual([])
    expect(next.state.events.flatMap(event => event.type === 'worker.returned' && event.round === 4 ? event.workers : [])
      .map(worker => worker.workerId).sort()).toEqual(['1', '1', '2', '2'])
  })

  it('leaves A without a Guest in round 5: the card gave one Guest for round 4 only', () => {
    const session = setup()
    playGuest(session)
    playRoundWithoutGuest(session, 3)
    dispatchGuest(session, 'fishing')
    let handOff = confirmNextPlayer(session)
    for (const [playerIndex, spaceId] of [[1, 'day-laborer'], [0, 'forest'], [1, 'reed-bank'], [0, 'clay-pit']] as const) {
      expect(session.takeAction(playerIndex, spaceId).ok).toBe(true)
      handOff = confirmNextPlayer(session)
    }
    expect(autoAdvanceRoundEnd(session, { initialResponse: handOff }).state.round).toBe(5)

    // Round 5 is an ordinary round again: two placements each, then round 6.
    playRoundWithoutGuest(session, 5)
    const later = session.getState()
    expect(later.state.round).toBe(6)
    expect(later.state.players[0]!.guests).toEqual([])
    expect(facts(later, 'guest.granted')).toHaveLength(1)
  })

  it('voids the Guest when A does not dispatch it in round 4', () => {
    const session = setup()
    const a = session.state.players[0]!.id
    playGuest(session)
    playRoundWithoutGuest(session, 3)

    // A places a family member each time the Guest is offered next to one.
    expect(takeNormalWorkerTurn(session, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(takeNormalWorkerTurn(session, 'clay-pit').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'reed-bank').ok).toBe(true)

    // After the last family member the Guest is A's last possible placement of the round, and A passes on it.
    const lastChance = confirmNextPlayer(session)
    expect(lastChance.state.round).toBe(4)
    expect(lastChance.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(choiceLabels(lastChance)).toEqual(['actions.activate-extra-turn.name', 'ui.interactionDecline'])
    expect(lastChance.state.players[0]!.guests).toEqual([BOOKED])
    expect(facts(lastChance, 'guest.voided')).toEqual([])
    const decline = getChoiceOptions(lastChance).find(option => option.labelKey === 'ui.interactionDecline')
    const declined = session.resolveChoice(0, decline!.value)
    expect(declined.ok, declined.error).toBe(true)
    expect(declined.state.players[0]!.guests).toEqual([])
    expect(facts(declined, 'guest.voided')).toEqual([expect.objectContaining({
      actorPlayerId: a, playerId: a, guestId: 'guest:1', cardId: GUEST, round: 4,
    })])
    expect(declined.state.actionSpaces.flatMap(candidate => candidate.takenBy).filter(ref => ref.guest)).toEqual([])

    // The round then ends as usual. Nothing is voided twice, and round 5 has no Guest.
    const next = autoAdvanceRoundEnd(session, { initialResponse: confirmNextPlayer(session) })
    expect(next.state.round).toBe(5)
    expect(next.state.players[0]!.guests).toEqual([])
    expect(facts(next, 'guest.voided')).toHaveLength(1)
    expect(next.state.events.flatMap(event => event.type === 'worker.placed' && event.round === 4 && event.actorPlayerId === a
      ? [event.workerId] : [])).toEqual(['1', '2'])
    expect(next.interaction.stateId).toBe('idle')
    expect(owesExtraTurn(session, 0)).toBe(false)
  })

  it('keeps A\'s booking after passing the card left, and still dispatches the Guest in round 4', () => {
    const session = setup()
    const a = session.state.players[0]!.id
    const passed = playGuest(session)
    expect(passed.state.players[0]!.minorPlayed).toEqual([])
    expect(passed.state.players[0]!.cardStates[GUEST]).toBeUndefined()
    expect(passed.state.players[1]!.minorHand).toEqual([PLACEHOLDER, GUEST])
    expect(passed.state.events).toContainEqual(expect.objectContaining({
      type: 'card.passed', cardId: GUEST, fromPlayerId: a, toPlayerId: passed.state.players[1]!.id,
    }))
    expect(passed.state.players[0]!.guests).toEqual([BOOKED])
    expect(passed.state.players[1]!.guests ?? []).toEqual([])

    playRoundWithoutGuest(session, 3)
    const offered = session.getState()
    expect(offered.state.round).toBe(4)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(choiceLabels(offered)).toEqual(['actions.place-farmer.name', 'actions.activate-extra-turn.name'])
    expect(guestOption(offered)?.labelParams).toEqual({ guestId: 'guest:1', guestCardId: GUEST })
    const wood = space(offered, 'forest').resources.wood
    expect(wood).toBeGreaterThan(0)
    const before = offered.state.players[0]!.resources.wood

    const placed = dispatchGuest(session, 'forest')
    expect(space(placed, 'forest').takenBy).toEqual([{ playerId: a, workerId: 'guest:1', guest: true }])
    expect(placed.state.players[0]!.resources.wood).toBe(before + wood)
    // Holding the card gives B nothing: a Guest comes from playing it.
    expect(placed.state.players[1]!.guests ?? []).toEqual([])
    expect(confirmNextPlayer(session).interaction.stateId).toBe('idle')
  })

  it('logs an ordinary placement beside a pending Guest once, under the space it uses', () => {
    const session = setup()
    playGuest(session)
    playRoundWithoutGuest(session, 3)
    const offered = session.getState()
    expect(offered.state.round).toBe(4)
    expect(choiceLabels(offered)).toEqual(['actions.place-farmer.name', 'actions.activate-extra-turn.name'])
    const wood = space(offered, 'forest').resources.wood
    const logged = offered.state.log.length

    expect(takeNormalWorkerTurn(session, 'forest').ok).toBe(true)
    const handOff = confirmNextPlayer(session)
    expect(handOff.ok, handOff.error).toBe(true)

    // The log is newest first; these are the rows of A's turn.
    const rows = handOff.state.log.slice(0, handOff.state.log.length - logged)
    expect(JSON.stringify(rows)).not.toContain('__subflow')
    expect(rows.filter(row => row.key === 'log.placeFarmer')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ action: 'actions.forest.name' }) }),
    ])
    expect(rows.filter(row => row.key === 'log.actionDetail')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({
        action: 'actions.forest.name', detailParts: expect.objectContaining({ gains: { wood } }),
      }) }),
    ])
  })

  it('lets the left recipient buy and pass Guest on the next round and book its own Guest', () => {
    const session = setup()
    const [a, b] = session.state.players.map(player => player.id)
    playGuest(session)
    playRoundWithoutGuest(session, 3)

    expect(takeNormalWorkerTurn(session, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    const bought = playGuest(session, 1)
    expect(bought.state.players[0]!.guests).toEqual([BOOKED])
    expect(bought.state.players[1]!.guests).toEqual([{ ...BOOKED, round: 5 }])
    expect(bought.state.players.map(player => player.minorHand)).toEqual([[PLACEHOLDER, GUEST], [PLACEHOLDER]])
    expect(facts(bought, 'guest.granted')).toEqual([
      expect.objectContaining({ playerId: a, targetRound: 4, cardId: GUEST }),
      expect.objectContaining({ playerId: b, targetRound: 5, cardId: GUEST }),
    ])
    expect(bought.state.events.filter(event => event.type === 'card.passed')).toEqual([
      expect.objectContaining({ cardId: GUEST, fromPlayerId: a, toPlayerId: b }),
      expect.objectContaining({ cardId: GUEST, fromPlayerId: b, toPlayerId: a }),
    ])
  })

  it('discards the passing card in a solo game and keeps the Guest for the next round', () => {
    const session = setup(3, undefined, 1)
    const bought = playGuest(session)
    expect(bought.state.players[0]!.minorHand).toEqual([PLACEHOLDER])
    expect(bought.state.ordinaryCardDecks.minor).not.toContain(GUEST)
    expect(bought.state.players[0]!.guests).toEqual([BOOKED])
    expect(bought.state.events).toContainEqual(expect.objectContaining({
      type: 'card.destroyed', cardId: GUEST, reason: 'passed', playerId: bought.state.players[0]!.id,
    }))
    expect(bought.state.events.some(event => event.type === 'card.passed' && event.cardId === GUEST)).toBe(false)

    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(0)
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).state.round).toBe(4)
    const placed = dispatchGuest(session, 'fishing')
    expect(space(placed, 'fishing').takenBy).toEqual([{ playerId: bought.state.players[0]!.id, workerId: 'guest:1', guest: true }])
  })

  it('keeps both public bookings and the later dispatch visible after Guest passes back into a private hand', () => {
    // Seed 1 reveals Major Improvement in round 1, so both seats can buy the same card this round.
    const session = setup(1, undefined, 2, 1)
    const [a, b] = session.state.players.map(player => player.id)
    playGuest(session)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    playGuest(session, 1, 'major-improvement')

    const views = (visible: string[]) => [
      session.buildSyncPayload(session.getState(), visible).state,
      filterSerializedStateForPlayer(serializeSessionSnapshot(session.state, session).frame, visible),
    ]
    for (const visible of [[], [a!], [b!]]) {
      for (const view of views(visible)) {
        expect(view.players[0]!.minorHand).toEqual(visible.includes(a!) ? [PLACEHOLDER, GUEST] : ['?', '?'])
        expect(view.players.map(player => player.scheduledEffects)).toEqual([
          [expect.objectContaining({ sourceCard: GUEST, round: 2 })],
          [expect.objectContaining({ sourceCard: GUEST, round: 2 })],
        ])
        const grants = view.events.filter(event => event.type === 'guest.granted')
        expect(grants.map(event => event.playerId)).toEqual([a, b])
        expect(view.log.filter(entry => entry.key === 'log.guestGranted').map(entry => entry.playerId)).toEqual([b, a])
        const archived = view.publicEventArchive.flatMap(packet => packet.type === 'publicEvents.committed' ? packet.eventIds : [])
        expect(archived).toEqual(expect.arrayContaining(grants.map(event => event.id)))
      }
    }

    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(0)
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'reed-bank').ok).toBe(true)
    expect(confirmNextPlayer(session).state.round).toBe(2)
    dispatchGuest(session, 'fishing')
    for (const visible of [[], [b!]]) {
      for (const view of views(visible)) {
        expect(view.events).toContainEqual(expect.objectContaining({ type: 'worker.placed', workerId: 'guest:1', spaceId: 'fishing' }))
        const use = view.events.find(event => event.type === 'actionSpace.useStarted' && event.personUse?.workerId === 'guest:1')
        expect(use).toMatchObject({ spaceId: 'fishing', actorPlayerId: a })
        expect(view.log).toContainEqual(expect.objectContaining({ key: 'log.guestDispatched', playerId: a }))
        expect(view.publicEventArchive.flatMap(packet => packet.type === 'publicEvents.committed' ? packet.eventIds : []))
          .toContain(use?.id)
      }
    }
    expect(session.undoAction().ok).toBe(true)
    for (const view of views([])) {
      const canceled = view.publicEventArchive.flatMap(packet => packet.type === 'publicEvents.canceled' ? packet.canceledEvents : [])
      expect(canceled).toContainEqual(expect.objectContaining({ type: 'worker.placed', workerId: 'guest:1', spaceId: 'fishing' }))
      expect(canceled).toContainEqual(expect.objectContaining({
        type: 'actionSpace.useStarted', spaceId: 'fishing', personUse: expect.objectContaining({ workerId: 'guest:1' }),
      }))
    }
  })

  it('still gives a Guest for the last round when it is played in round 13', () => {
    const session = setup(13)

    expect(playGuest(session).state.players[0]!.guests).toEqual([{ ...BOOKED, round: 14 }])
  })

  it('gives no Guest when it is played in round 14, the last round, and leaves the final scoring alone', () => {
    /** Round 14 to the end of the game; A plays Guest on the first turn or not at all. */
    const finish = (withGuest: boolean) => {
      const session = setup(14, (state) => {
        // Enough food for the last harvest, so no begging card blurs the comparison.
        for (const player of state.players) player.resources.food = 10
      })
      if (withGuest) {
        const played = playGuest(session)
        expect(played.state.players[0]!.guests ?? []).toEqual([])
        expect(facts(played, 'guest.granted')).toEqual([])
        expect(played.state.currentPlayerIndex).toBe(0)
        expect(played.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
        expect(played.state.players[1]!.minorHand).toContain(GUEST)
      }
      const final = autoAdvanceRoundEnd(session, { initialResponse: playRoundWithoutGuest(session, 14) })
      expect(final.state.gameOver).toBe(true)
      expect(final.interaction.stateId).toBe('gameover')
      return final
    }

    const control = finish(false)
    const final = finish(true)

    expect(final.state.round).toBe(14)
    expect(final.state.players[0]!.guests ?? []).toEqual([])
    expect(facts(final, 'guest.granted')).toEqual([])
    expect(facts(final, 'guest.voided')).toEqual([])
    expect(final.scores).toEqual(control.scores)
    // A bare farm: -1 in each of seven categories, -13 for unused spaces, +6 for two family members.
    expect(final.scores!.map(score => score.total)).toEqual([-14, -14])
    expect(final.scores![0]!.categories.find(category => category.key === 'farmers')).toMatchObject({ quantity: 2, total: 6 })
  })

  it.each(['dispatches', 'declines'] as const)('counts the Guest in A\'s player panel from the start of round 4 until A %s it', (ending) => {
    const session = setup()
    playGuest(session)
    // What each viewer's client receives for a player's panel.
    const panelGuests = (viewerIndex: number, playerIndex: number) => session
      .buildSyncPayload(session.getState(), [session.state.players[viewerIndex]!.id])
      .state.players[playerIndex]!.playerPanelSummary.guests
    const seenByBoth = (playerIndex: number) => [0, 1].map(viewerIndex => panelGuests(viewerIndex, playerIndex))

    // Booked for the next round, the Guest is not yet one A can dispatch.
    expect(seenByBoth(0)).toEqual([undefined, undefined])
    playRoundWithoutGuest(session, 3)
    expect(seenByBoth(0)).toEqual([{ pending: 1 }, { pending: 1 }])
    expect(seenByBoth(1)).toEqual([undefined, undefined])

    if (ending === 'dispatches') {
      dispatchGuest(session, 'forest')
    } else {
      // Placing family members first keeps the Guest waiting.
      for (const [familySpace, reply] of [['forest', 'day-laborer'], ['clay-pit', 'reed-bank']] as const) {
        expect(takeNormalWorkerTurn(session, familySpace).ok).toBe(true)
        expect(confirmNextPlayer(session).ok).toBe(true)
        expect(seenByBoth(0)).toEqual([{ pending: 1 }, { pending: 1 }])
        expect(session.takeAction(1, reply).ok).toBe(true)
        expect(confirmNextPlayer(session).ok).toBe(true)
      }
      const decline = getChoiceOptions(session.getState()).find(option => option.labelKey === 'ui.interactionDecline')
      expect(session.resolveChoice(0, decline!.value).ok).toBe(true)
    }
    expect(session.state.round).toBe(4)
    expect(seenByBoth(0)).toEqual([undefined, undefined])
  })

  it.each(['after the card is played', 'after round 4 has started'] as const)('restores a game saved %s with the same Guest and the same way to dispatch it', (moment) => {
    const session = setup()
    const a = session.state.players[0]!.id
    playGuest(session)
    if (moment === 'after round 4 has started') playRoundWithoutGuest(session, 3)
    const saved = session.getState()

    const restored = restore(session)
    const loaded = restored.getState()
    expect(loaded.interaction).toEqual(saved.interaction)
    expect(JSON.parse(JSON.stringify(loaded.state))).toEqual(JSON.parse(JSON.stringify(saved.state)))
    expect(loaded.scores).toEqual(saved.scores)
    expect(loaded.state.players[0]!.guests).toEqual([BOOKED])

    // The restored game goes on from the same point: nothing to dispatch in round 3, the Guest in round 4.
    if (moment === 'after the card is played') {
      expect(loaded.state.round).toBe(3)
      playRoundWithoutGuest(restored, 3)
    }
    const offered = restored.getState()
    expect(offered.state.round).toBe(4)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(choiceLabels(offered)).toEqual(['actions.place-farmer.name', 'actions.activate-extra-turn.name'])
    expect(guestOption(offered)?.labelParams).toEqual({ guestId: 'guest:1', guestCardId: GUEST })
    const placed = dispatchGuest(restored, 'forest')
    expect(space(placed, 'forest').takenBy).toEqual([{ playerId: a, workerId: 'guest:1', guest: true }])
    expect(placed.state.players[0]!.guests).toEqual([{ ...BOOKED, dispatched: true }])
  })
})
