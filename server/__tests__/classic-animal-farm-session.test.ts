import { afterEach, describe, expect, it } from 'vitest'
import { getRoundPersonPlacementDetails, getRoundPersonPlacementOrder } from '../../shared/cards/helpers/round-placement'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { familySize, getFamilyTokenLimit, markAllWorkersUsed, setActiveWorkerCount, workersAvailable } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { getHarvestRequirements } from '../../shared/session/harvest-requirements'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { playImprovement } from './_helpers/card-play-lifecycle'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'
import { takeNormalWorkerTurn } from './_helpers/supply-worker-turn'

const ANIMAL_FARM = 'CG062_AnimalFarm'
const PLACEHOLDER = '__test_placeholder__'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function keepSheep(player: PlayerState, sheep: number) {
  player.resources.sheep = sheep
  player.pastures = [{
    id: 'sheep', animalType: 'sheep', animalCount: sheep,
    tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }],
  }]
  player.fenceSegments = ['H-1-1', 'H-1-2', 'H-2-1', 'H-2-2', 'V-1-1', 'V-1-3'].map(edge => ({
    edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id },
  }))
}

/** A new 2-player work phase, with two family members and A to move. */
function setup(configure?: (state: GameState) => void, cardZone: 'played' | 'hand' = 'played') {
  const session = createWorkSession({ seed: 62, configure(state) {
    for (const player of state.players) {
      player.minorHand = [PLACEHOLDER]
      player.occupationHand = [PLACEHOLDER]
      player.minorPlayed = []
      player.occupationPlayed = []
    }
    const owner = state.players[0]!
    keepSheep(owner, 1)
    if (cardZone === 'hand') owner.minorHand = [ANIMAL_FARM, PLACEHOLDER]
    else owner.minorPlayed = [ANIMAL_FARM]
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function keepBoar(player: PlayerState) {
  const room = player.roomTiles[0]!
  player.resources.boar = 1
  player.houseAnimals = { [`${room.row}-${room.col}`]: 'boar' }
}

const exchangeEntry = (response: SessionResponse) =>
  response.interaction.stateId === 'gameover' ? undefined
    : response.interaction.anytimeActions.find(action => action.sourceCard === ANIMAL_FARM)

function exchange(session: GameSession) {
  const entry = exchangeEntry(session.getState())
  expect(entry, 'Animal Farm exchange is offered').toBeDefined()
  const response = session.takeAnytimeAction(0, entry!.id)
  expect(response.ok, response.error).toBe(true)
  return response
}

function restore(session: GameSession) {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.push(restored)
  return restored
}

const choiceLabels = (response: SessionResponse) => getChoiceOptions(response).map(option => option.labelKey)
const guestOption = (response: SessionResponse) =>
  getChoiceOptions(response).find(option => typeof option.labelParams?.guestId === 'string')
const space = (response: SessionResponse, spaceId: string) =>
  response.state.actionSpaces.find(candidate => candidate.id === spaceId)!

/** Picks the Guest in the pending placement choice and sends it to `spaceId`. */
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

describe('CG062 Animal Farm', () => {
  it('plays from hand for one wood with sheep in a pasture and a boar in the house', () => {
    const session = setup(state => {
      const owner = state.players[0]!
      owner.resources.wood = 1
      keepBoar(owner)
    }, 'hand')

    const played = playImprovement(session, ANIMAL_FARM, 'meeting-place')
    const owner = played.state.players[0]!
    expect(owner.minorHand).toEqual([PLACEHOLDER])
    expect(owner.minorPlayed).toEqual([ANIMAL_FARM])
    expect(owner.resources).toMatchObject({ wood: 0, sheep: 1, boar: 1 })
    expect(played.state.events).toContainEqual(expect.objectContaining({
      type: 'card.played', cardId: ANIMAL_FARM, payment: expect.objectContaining({ resources: { wood: 1 } }),
    }))
    expect(exchangeEntry(played)).toBeDefined()
  })

  it.each([
    { reason: 'has two sheep but only one species', wood: 1, species: 1 },
    { reason: 'has both species but no wood', wood: 0, species: 2 },
  ])('keeps Animal Farm in hand when A $reason', ({ wood, species }) => {
    const session = setup(state => {
      const owner = state.players[0]!
      owner.resources.wood = wood
      if (species === 1) keepSheep(owner, 2)
      else keepBoar(owner)
    }, 'hand')

    const meeting = session.takeAction(0, 'meeting-place')
    expect(meeting.ok, meeting.error).toBe(true)
    expect(getChoiceOptions(meeting).some(option => option.value === ANIMAL_FARM)).toBe(false)
    expect(meeting.state.players[0]!).toMatchObject({
      minorHand: [ANIMAL_FARM, PLACEHOLDER], minorPlayed: [], resources: { wood },
    })
  })

  it('returns one sheep to the supply on its own work turn for a Guest of this round', () => {
    const session = setup()
    const round = session.state.round

    const response = exchange(session)

    const owner = response.state.players[0]!
    expect(owner.resources.sheep).toBe(0)
    expect(owner.pastures[0]).toMatchObject({ animalType: null, animalCount: 0 })
    expect(owner.guests).toEqual([{ id: 'guest:1', sourceCardId: ANIMAL_FARM, round }])
    expect(response.state.players[1]!.guests ?? []).toEqual([])
  })

  it('dispatches the Guest after both family members, so A places three times while B rotates normally', () => {
    const session = setup()
    const a = session.state.players[0]!.id
    const food = session.state.players[0]!.resources.food
    const fish = space(session.getState(), 'fishing').resources.food

    const offered = exchange(session)
    // The Guest joins the choice of what A places this turn.
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(choiceLabels(offered)).toEqual(['actions.place-farmer.name', 'actions.activate-extra-turn.name'])
    expect(guestOption(offered)?.labelParams).toEqual({ guestId: 'guest:1', guestCardId: ANIMAL_FARM })

    expect(takeNormalWorkerTurn(session, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(choiceLabels(confirmNextPlayer(session))).toEqual(['actions.place-farmer.name', 'actions.activate-extra-turn.name'])
    expect(takeNormalWorkerTurn(session, 'clay-pit').ok).toBe(true)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'reed-bank').ok).toBe(true)

    // Both family members are placed: only the Guest is left, and A may decline it.
    const lastChance = confirmNextPlayer(session)
    expect(lastChance.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(workersAvailable(lastChance.state, lastChance.state.players[0]!)).toBe(0)
    expect(choiceLabels(lastChance)).toEqual(['actions.activate-extra-turn.name', 'ui.interactionDecline'])

    const placed = dispatchGuest(session, 'fishing')
    expect(space(placed, 'fishing').takenBy).toEqual([{ playerId: a, workerId: 'guest:1', guest: true }])
    expect(placed.state.players[0]!.resources.food).toBe(food + fish)
    expect(getRoundPersonPlacementOrder(placed.state.players[0]!)).toEqual(['forest', 'clay-pit', 'fishing'])
    expect(getRoundPersonPlacementOrder(placed.state.players[1]!)).toEqual(['day-laborer', 'reed-bank'])
    expect(placed.state.players[0]!.guests).toEqual([
      { id: 'guest:1', sourceCardId: ANIMAL_FARM, round: placed.state.round, dispatched: true },
    ])
  })

  it('dispatches the Guest before any family member to an accumulation space, which B can no longer use', () => {
    const session = setup()
    const a = session.state.players[0]!.id
    const wood = space(session.getState(), 'forest').resources.wood
    expect(wood).toBeGreaterThan(0)

    exchange(session)
    const placed = dispatchGuest(session, 'forest')

    // The Guest carries out the space's action and occupies it like a family member.
    expect(placed.state.players[0]!.resources.wood).toBe(wood)
    expect(space(placed, 'forest').resources.wood).toBe(0)
    expect(space(placed, 'forest').takenBy).toEqual([{ playerId: a, workerId: 'guest:1', guest: true }])
    expect(workersAvailable(placed.state, placed.state.players[0]!)).toBe(2)
    expect(placed.state.events.filter(event => event.type === 'worker.placed').at(-1))
      .toMatchObject({ workerId: 'guest:1', spaceId: 'forest', actorPlayerId: a })

    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.getActionAvailability(1).forest).toBe(false)
    assertRejectedUnchanged(session, () => session.takeAction(1, 'forest'))
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)

    // The Guest is used up: A is back to ordinary turns with both family members.
    const back = confirmNextPlayer(session)
    expect(back.state.currentPlayerIndex).toBe(0)
    expect(back.interaction.stateId).toBe('idle')
    expect(session.takeAction(0, 'clay-pit').ok).toBe(true)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'reed-bank').ok).toBe(true)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(0)
    const last = session.takeAction(0, 'fishing')
    expect(last.ok, last.error).toBe(true)

    // The Person Placement Order counts the Guest as A's first placed person.
    expect(getRoundPersonPlacementDetails(last.state.players[0]!)).toEqual([
      { spaceId: 'forest', workerId: 'guest:1' },
      { spaceId: 'clay-pit', workerId: '1' },
      { spaceId: 'fishing', workerId: '2' },
    ])
    expect(last.state.events.flatMap(event => event.type === 'actionSpace.useStarted' && event.actorPlayerId === a
      ? [event.personUse] : [])).toEqual([
      { workerId: 'guest:1', placementOrdinal: 1 },
      { workerId: '1', placementOrdinal: 2 },
      { workerId: '2', placementOrdinal: 3 },
    ])
    expect(getRoundPersonPlacementOrder(last.state.players[1]!)).toEqual(['day-laborer', 'reed-bank'])
  })

  it('can still be used in the hand-off after A\'s last family member, which keeps the work phase open', () => {
    const session = setup(state => markAllWorkersUsed(state, state.players[1]!))
    const round = session.state.round
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    const last = session.takeAction(0, 'clay-pit')
    expect(last.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player' } })

    // Every family member is placed, but A's work turn is not handed off yet.
    const granted = exchange(session)
    expect(granted.state.players[0]!.guests).toHaveLength(1)
    expect(granted.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player' } })

    const offered = confirmNextPlayer(session)
    expect(offered.state.round).toBe(round)
    expect(offered.state.roundPhase).toBe('work')
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(choiceLabels(offered)).toEqual(['actions.activate-extra-turn.name', 'ui.interactionDecline'])
    dispatchGuest(session, 'fishing')
    expect(getRoundPersonPlacementOrder(session.state.players[0]!)).toEqual(['forest', 'clay-pit', 'fishing'])
    expect(confirmNextPlayer(session).state.round).toBe(round + 1)
  })

  it('still grants and dispatches a Guest to a player with all five family members: six placements', () => {
    const session = setup((state) => {
      setActiveWorkerCount(state.players[0]!, 5)
      markAllWorkersUsed(state, state.players[1]!)
    })
    expect(familySize(session.state.players[0]!)).toBe(5)
    expect(getFamilyTokenLimit(session.state.players[0]!)).toBe(5)

    exchange(session)
    dispatchGuest(session, 'forest')
    for (const spaceId of ['clay-pit', 'reed-bank', 'fishing', 'day-laborer', 'grain-seeds']) {
      expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(0)
      const response = session.takeAction(0, spaceId)
      expect(response.ok, response.error).toBe(true)
    }

    const owner = session.state.players[0]!
    expect(getRoundPersonPlacementOrder(owner))
      .toEqual(['forest', 'clay-pit', 'reed-bank', 'fishing', 'day-laborer', 'grain-seeds'])
    expect(workersAvailable(session.state, owner)).toBe(0)
    // The Guest took no family token: the family and its token limit are still five.
    expect(familySize(owner)).toBe(5)
    expect(getFamilyTokenLimit(owner)).toBe(5)
    expect(owner.workers.map(worker => worker.id)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('returns the dispatched Guest to the general supply at return home, so A has none next round', () => {
    const session = setup(state => keepSheep(state.players[0]!, 2))
    const round = session.state.round

    exchange(session)
    dispatchGuest(session, 'forest')
    expect(confirmNextPlayer(session).ok).toBe(true)
    for (const [playerIndex, spaceId] of [[1, 'day-laborer'], [0, 'clay-pit'], [1, 'reed-bank'], [0, 'fishing']] as const) {
      expect(session.takeAction(playerIndex, spaceId).ok).toBe(true)
      expect(confirmNextPlayer(session).ok).toBe(true)
    }

    const next = session.getState()
    expect(next.state.round).toBe(round + 1)
    expect(next.state.roundPhase).toBe('work')
    expect(next.state.actionSpaces.flatMap(candidate => candidate.takenBy)).toEqual([])
    expect(next.state.players[0]!.guests).toEqual([])
    // A used Guest goes back without a "voided" fact, and it does not go home with the family.
    expect(next.state.events.filter(event => event.type === 'guest.voided')).toEqual([])
    expect(next.state.events.flatMap(event => event.type === 'worker.returned' ? event.workers : [])
      .map(worker => worker.workerId).sort()).toEqual(['1', '1', '2', '2'])
    // No Guest is offered in the new round, but the card can be used again.
    expect(next.state.currentPlayerIndex).toBe(0)
    expect(next.interaction.stateId).toBe('idle')
    expect(next.state.players[0]!.resources.sheep).toBe(1)
    expect(exchangeEntry(next)).toBeDefined()
  })

  it('voids a Guest that A never dispatches, without giving the animal back', () => {
    const session = setup()
    const a = session.state.players[0]!.id
    const round = session.state.round
    const facts = (response: SessionResponse, type: 'guest.granted' | 'guest.voided') =>
      response.state.events.filter(event => event.type === type)

    const granted = exchange(session)
    expect(facts(granted, 'guest.granted')).toEqual([expect.objectContaining({
      actorPlayerId: a, playerId: a, guestId: 'guest:1', cardId: ANIMAL_FARM, targetRound: round,
    })])

    expect(takeNormalWorkerTurn(session, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(takeNormalWorkerTurn(session, 'clay-pit').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'reed-bank').ok).toBe(true)
    const lastChance = confirmNextPlayer(session)
    expect(facts(lastChance, 'guest.voided')).toEqual([])

    const decline = getChoiceOptions(lastChance).find(option => option.labelKey === 'ui.interactionDecline')
    const declined = session.resolveChoice(0, decline!.value)
    expect(declined.ok, declined.error).toBe(true)
    expect(declined.state.players[0]!.guests).toEqual([])
    expect(facts(declined, 'guest.voided')).toEqual([expect.objectContaining({
      actorPlayerId: a, playerId: a, guestId: 'guest:1', cardId: ANIMAL_FARM,
    })])
    expect(getRoundPersonPlacementOrder(declined.state.players[0]!)).toEqual(['forest', 'clay-pit'])

    // The work phase then ends as usual; nothing is refunded and nothing is voided twice.
    const next = confirmNextPlayer(session)
    expect(next.ok, next.error).toBe(true)
    expect(next.state.round).toBe(round + 1)
    expect(next.state.players[0]!.resources.sheep).toBe(0)
    expect(next.state.players[0]!.guests).toEqual([])
    expect(facts(next, 'guest.voided')).toHaveLength(1)
    expect(next.interaction.stateId).toBe('idle')
  })

  it('can be used only once per round', () => {
    const session = setup(state => keepSheep(state.players[0]!, 2))
    const entry = exchangeEntry(session.getState())!

    const granted = exchange(session)
    expect(granted.state.players[0]!.resources.sheep).toBe(1)
    expect(granted.state.players[0]!.guests).toHaveLength(1)
    expect(exchangeEntry(granted)).toBeUndefined()
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, entry.id))

    // Not after dispatching either, nor on A's later turns of the round.
    const placed = dispatchGuest(session, 'forest')
    expect(exchangeEntry(placed)).toBeUndefined()
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    const back = confirmNextPlayer(session)
    expect(back.state.currentPlayerIndex).toBe(0)
    expect(exchangeEntry(back)).toBeUndefined()
    expect(back.state.players[0]!.resources.sheep).toBe(1)
  })

  it('keeps the Guest out of feeding, family scoring, the family token limit and housing', () => {
    const session = setup((state) => {
      state.round = 7
      // No food, and one grain to convert: every player gets to settle the feeding by hand.
      for (const player of state.players) Object.assign(player.resources, { food: 0, grain: 1 })
      const owner = state.players[0]!
      owner.roomTiles = [...owner.roomTiles, { row: 0, col: 0 }]
      owner.rooms = 3
      markAllWorkersUsed(state, state.players[1]!)
    })

    exchange(session)
    const placed = dispatchGuest(session, 'forest')
    const owner = placed.state.players[0]!
    expect(space(placed, 'forest').takenBy).toEqual([{ playerId: owner.id, workerId: 'guest:1', guest: true }])
    expect(familySize(owner)).toBe(2)
    expect(getFamilyTokenLimit(owner)).toBe(5)
    expect(session.withCtx(() => getHarvestRequirements(placed.state, owner))).toMatchObject({ round: 7, food: 4 })
    expect(placed.scores![0]!.categories.find(category => category.key === 'farmers'))
      .toMatchObject({ quantity: 2, total: 6 })

    // Housing: with three rooms and two family members there is room for a child, Guest or not.
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(0)
    expect(session.getActionAvailability(0)['wish-children']).toBe(true)
    const grown = session.takeAction(0, 'wish-children')
    expect(grown.ok, grown.error).toBe(true)
    expect(familySize(grown.state.players[0]!)).toBe(3)
    expect(confirmNextPlayer(session).ok).toBe(true)
    const last = session.takeAction(0, 'clay-pit')
    expect(last.ok, last.error).toBe(true)

    // The harvest asks A to feed two adults and the newborn, and nothing for the Guest.
    const feeding = confirmNextPlayer(session)
    expect(feeding.state.roundPhase).toBe('feeding')
    expect(feeding.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed', remaining: 5 } })
    const next = autoAdvanceRoundEnd(session, { initialResponse: feeding })
    expect(next.state.round).toBe(8)
    expect(next.state.players[0]!.resources.begging).toBe(5)
    expect(next.state.players[0]!.guests).toEqual([])
  })

  describe('is not offered', () => {
    it('to an owner without an animal', () => {
      const session = setup((state) => {
        const owner = state.players[0]!
        owner.resources.sheep = 0
        owner.pastures = []
        owner.fenceSegments = []
      })
      expect(exchangeEntry(session.getState())).toBeUndefined()
      assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, `${ANIMAL_FARM}-exchange`))
    })

    it('to a player who has not played Animal Farm', () => {
      const session = setup(state => keepSheep(state.players[1]!, 1))
      expect(session.takeAction(0, 'forest').ok).toBe(true)
      const other = confirmNextPlayer(session)
      expect(other.state.currentPlayerIndex).toBe(1)
      expect(other.interaction.stateId).toBe('idle')
      expect(other.interaction.stateId === 'idle' && other.interaction.anytimeActions.map(action => action.sourceCard))
        .not.toContain(ANIMAL_FARM)
      assertRejectedUnchanged(session, () => session.takeAnytimeAction(1, `${ANIMAL_FARM}-exchange`))
    })

    it('while another player is on their work turn, even when the owner has to answer a prompt', () => {
      // Buyer lets A react when B uses Reed Bank, so A gets a prompt and anytime actions on B's turn.
      const session = setup(state => { state.players[0]!.occupationPlayed = ['A156_Buyer'] })
      expect(session.takeAction(0, 'forest').ok).toBe(true)
      expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
      expect(session.takeAction(1, 'reed-bank').ok).toBe(true)
      const prompt = confirmPlayerSwitch(session)
      expect(prompt.state.currentPlayerIndex).toBe(1)
      expect(prompt.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: 'A156_Buyer' })
      expect(prompt.interaction.stateId === 'wait' && prompt.interaction.allowedCommands).toContain('takeAnytimeAction')
      expect(exchangeEntry(prompt)).toBeUndefined()
      assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, `${ANIMAL_FARM}-exchange`))
    })

    it('outside the work phase', () => {
      const session = setup((state) => {
        state.round = 4
        for (const player of state.players) {
          // No food, and one grain to convert: the feeding is settled by hand, with anytime actions open.
          Object.assign(player.resources, { food: 0, grain: 1 })
          markAllWorkersUsed(state, player)
        }
      })
      const feeding = session.performRoundEnd()
      expect(feeding.state.roundPhase).toBe('feeding')
      expect(feeding.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed' } })
      expect(feeding.interaction.stateId === 'wait' && feeding.interaction.allowedCommands).toContain('takeAnytimeAction')
      expect(exchangeEntry(feeding)).toBeUndefined()
      assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, `${ANIMAL_FARM}-exchange`))
    })
  })

  it.each(['after the exchange', 'after the dispatch'] as const)('restores a game saved %s with the same state and options', (moment) => {
    const session = setup()
    exchange(session)
    if (moment === 'after the dispatch') dispatchGuest(session, 'forest')
    const saved = session.getState()

    const restored = restore(session)
    const loaded = restored.getState()
    expect(loaded.interaction).toEqual(saved.interaction)
    expect(JSON.parse(JSON.stringify(loaded.state))).toEqual(JSON.parse(JSON.stringify(saved.state)))
    expect(loaded.scores).toEqual(saved.scores)

    // The restored game goes on from the same point.
    if (moment === 'after the exchange') {
      expect(guestOption(loaded)?.labelParams).toEqual({ guestId: 'guest:1', guestCardId: ANIMAL_FARM })
      const placed = dispatchGuest(restored, 'forest')
      expect(space(placed, 'forest').takenBy).toEqual([
        { playerId: placed.state.players[0]!.id, workerId: 'guest:1', guest: true },
      ])
    } else {
      expect(space(loaded, 'forest').takenBy).toEqual([
        { playerId: loaded.state.players[0]!.id, workerId: 'guest:1', guest: true },
      ])
      expect(confirmNextPlayer(restored).state.currentPlayerIndex).toBe(1)
      assertRejectedUnchanged(restored, () => restored.takeAction(1, 'forest'))
    }
  })

  it('continues a game saved before Guests existed', () => {
    const session = setup()
    const snapshot = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))
    // Such a save has no Guest field on any player and no marked person on any space.
    for (const player of [...snapshot.state.players, ...snapshot.frame.players]) expect(player).not.toHaveProperty('guests')

    const restored = new GameSession(rehydrateState(snapshot))
    sessions.push(restored)
    expect(restored.getState().interaction.stateId).toBe('idle')
    exchange(restored)
    const placed = dispatchGuest(restored, 'forest')
    expect(placed.state.players[0]!.guests).toHaveLength(1)
    expect(confirmNextPlayer(restored).state.currentPlayerIndex).toBe(1)
  })

  it('lets A take the exchange back before choosing a placement', () => {
    const session = setup()
    exchange(session)

    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.sheep).toBe(1)
    expect(undone.state.players[0]!.guests ?? []).toEqual([])
    expect(undone.state.events.filter(event => event.type === 'guest.granted')).toEqual([])
    expect(undone.interaction.stateId).toBe('idle')
    expect(exchangeEntry(undone)).toBeDefined()
  })
})
