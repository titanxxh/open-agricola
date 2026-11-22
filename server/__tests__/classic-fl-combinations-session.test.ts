import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { GameState, GuestPlacementScope } from '../../shared/contract/types'
import { flOptions, flCard, flSession, chooseBranch, confirmTurns } from './_helpers/classic-fl'
import {
  playImprovement,
  choose,
  restoreSession,
  bonusScore,
} from './_helpers/card-play-lifecycle'
import {
  setWorkersAtHome,
  setActiveWorkerCount,
  workersAvailable,
} from '../../shared/domain/player'
import { createDefaultRoomTiles } from '../../shared/domain/farmyard-geometry'
import { grantGuest } from '../../shared/domain/guests'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { createWorkSession } from './_helpers/session-fixtures'
import { takeNormalWorkerTurn } from './_helpers/supply-worker-turn'

const sessions: GameSession[] = []
const keep = (session: GameSession) => {
  sessions.push(session)
  return session
}
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))
function reveal(state: GameState, id: string) {
  const index = state.roundActionOrder.indexOf(id)
  if (index >= state.round)
    [state.roundActionOrder[index], state.roundActionOrder[0]] = [state.roundActionOrder[0]!, id]
  state.actionSpaces.find((space) => space.id === id)!.roundAvailable = 1
}
function accept(session: GameSession, response: SessionResponse): SessionResponse {
  for (let i = 0; i < 10; i++) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') return response
    if (response.interaction.request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
      continue
    }
    if (response.interaction.request.kind !== 'choice') return response
    response = chooseBranch(session, response)
  }
  throw new Error('Choice loop')
}

function loversTrystSession(rooms: number, occupationCount: number, adults = 2): GameSession {
  return keep(createWorkSession({
    seed: 6100,
    options: { playerCount: 2 },
    configure: (state) => {
      const [actor, opponent] = state.players
      actor!.minorHand = [flCard(24).id]
      actor!.occupationHand = ['__test_placeholder__']
      actor!.occupationPlayed = ['A099_FellowGrazer', 'A100_Curator'].slice(0, occupationCount)
      actor!.rooms = rooms
      actor!.roomTiles = createDefaultRoomTiles(rooms)
      setActiveWorkerCount(actor!, adults)
      actor!.startPlayer = false
      opponent!.minorHand = ['__test_placeholder__']
      opponent!.occupationHand = ['__test_placeholder__']
      opponent!.startPlayer = true
    },
  }))
}

function playStuckCartWithGuests(...scopes: (GuestPlacementScope | undefined)[]) {
  const cart = flCard(10).id
  const bakery = flCard(26).id
  const session = keep(createWorkSession({
    seed: 6100,
    options: { playerCount: 2 },
    configure: (state) => {
      state.currentPlayerIndex = 1
      const owner = state.players[0]!
      owner.minorHand = [cart]
      owner.minorPlayed = [bakery]
      owner.resources.wood = 1
      const firstSpace = state.actionSpaces.find((space) => space.id === 'day-laborer')!
      firstSpace.takenBy.push({ playerId: owner.id, workerId: '1' })
      recordRoundPlacement(owner, firstSpace.id, '1')
      state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
      for (const where of scopes) grantGuest(owner, { sourceCardId: bakery, round: state.round, where })
    },
  }))
  expect(workersAvailable(session.state, session.state.players[0]!)).toBe(1)
  const ownerTurn = confirmTurns(session, session.takeAction(1, 'reed-bank'))
  expect(ownerTurn.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
  let offered = chooseBranch(session, takeNormalWorkerTurn(session, 'meeting-place'))
  if (flOptions(offered).some((option) => option.value === cart))
    offered = choose(session, offered, cart)
  expect(workersAvailable(offered.state, offered.state.players[0]!)).toBe(0)
  return { session, offered, cart, bakery }
}

describe('FL: compound actions and cross-player timing', () => {
  it('Ebony Shoe: another player finishing their farm receives the one-time bonus', () => {
    const session = keep(
      flSession((state) => {
        state.players[0]!.minorPlayed = [flCard(9).id]
        state.currentPlayerIndex = 1
        const player = state.players[1]!
        player.fields = Array.from({ length: 15 }, (_, index) => ({
          row: Math.floor(index / 5),
          col: index % 5,
          stacks: [],
        })).filter(
          (tile) =>
            !(tile.row === 0 && tile.col === 1) &&
            !player.roomTiles.some((room) => room.row === tile.row && room.col === tile.col),
        )
      }),
    )
    let response = session.takeAction(1, 'farmland')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(1, { tile: { row: 0, col: 1 } })
    expect(response.ok, response.error).toBe(true)
    response = confirmTurns(session, response)
    expect(bonusScore(response, flCard(9).id, 1)).toBe(3)
    expect(bonusScore(response, flCard(9).id, 0)).toBe(0)
    expect(response.state.players[0]!.cardStates[flCard(9).id]?.flagged).toBe(true)
  })

  it('Stuck Cart: places remaining people in sequence and passes the card', () => {
    const session = keep(
      flSession((state) => {
        const p = state.players[0]!
        setActiveWorkerCount(p, 4)
        setWorkersAtHome(state, p, 3)
        recordRoundPlacement(p, 'copse', '1')
        p.minorHand = [flCard(10).id]
        p.resources.wood = 1
      }),
    )
    let response = session.takeAction(0, 'meeting-place')
    response = chooseBranch(session, response)
    if (
      response.interaction.stateId === 'wait' &&
      flOptions(response)?.some((option) => option.value === flCard(10).id)
    )
      response = choose(session, response, flCard(10).id)
    response = choose(session, response, 'forest')
    response = choose(session, response, 'clay-pit')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 1 })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain(flCard(10).id)
  })

  it('Stuck Cart: the second family member plays it and immediately sends a remaining Guest', () => {
    const { session, offered, cart, bakery } = playStuckCartWithGuests(undefined)
    expect(offered.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, sourceCard: cart, promptKey: 'ui.interactionPlaceFarmerExtra',
    })
    const placed = choose(session, offered, 'forest')
    const owner = placed.state.players[0]!
    expect(owner.resources.wood).toBe(3)
    expect(owner.guests).toEqual([{ id: 'guest:1', sourceCardId: bakery, round: 1, dispatched: true }])
    expect(placed.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toEqual([
      { playerId: owner.id, workerId: 'guest:1', guest: true },
    ])
    expect(owner.minorPlayed).not.toContain(cart)
    expect(placed.state.players[1]!.minorHand).toContain(cart)
    expect(placed.state.log).toContainEqual(expect.objectContaining({
      key: 'log.guestDispatched', playerId: owner.id,
    }))
    expect(bonusScore(placed, cart)).toBe(0)
    const handoff = confirmTurns(session, placed)
    expect(handoff.interaction.stateId).toBe('idle')
    expect(handoff.state.currentPlayerIndex).toBe(1)
  })

  it('Stuck Cart: finishes after the first Guest occupies the only legal space for both', () => {
    const where = { kind: 'spaces', spaceIds: ['forest'] } satisfies GuestPlacementScope
    const { session, offered, cart } = playStuckCartWithGuests(where, where)
    const guestChoices = flOptions(offered)
    expect(guestChoices.map((option) => option.labelParams?.guestId)).toEqual(['guest:1', 'guest:2'])
    const targets = choose(session, offered, guestChoices[0]!.value)
    expect(flOptions(targets).map((option) => option.value)).toEqual(['forest'])
    const placed = choose(session, targets, 'forest')
    expect(placed.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    const handoff = confirmTurns(session, placed)
    expect(handoff.state.currentPlayerIndex).toBe(1)
    expect(handoff.state.players[0]!.guests?.map(({ id, dispatched }) => [id, dispatched])).toEqual([
      ['guest:1', true], ['guest:2', undefined],
    ])
    expect(handoff.state.players[1]!.minorHand).toContain(cart)
  })

  it('Towhead: Family Growth moves to slot six and is exclusive to its owner in round five', () => {
    const session = keep(
      flSession((state) => {
        state.round = 4
        const p = state.players[0]!
        p.minorHand = [flCard(11).id]
        p.resources.wood = 1
        state.players.forEach((player) => {
          setWorkersAtHome(state, player, player.id === p.id ? 1 : 0)
          player.resources.food = 20
        })
      }),
    )
    let response = playImprovement(session, flCard(11).id, 'meeting-place')
    expect(response.state.roundActionOrder[5]).toBe('wish-children')
    response = autoAdvanceRoundEnd(session, { initialResponse: response })
    expect(response.state.round).toBe(5)
    expect(
      response.state.actionSpaces.find((space) => space.id === 'wish-children')!.exclusiveUse,
    ).toMatchObject({ playerId: response.state.players[0]!.id, untilRound: 6 })
  })

  it('Love Garden: unrevealed later growth spaces do not block the end-of-work growth', () => {
    const session = keep(
      flSession((state) => {
        state.round = 7
        state.players.forEach((player) => {
          setWorkersAtHome(state, player, 0)
          player.resources.food = 20
        })
        state.players[0]!.minorPlayed = [flCard(20).id]
        state.players[0]!.roomTiles.push({ row: 0, col: 0 })
        state.players[0]!.rooms = 3
        for (const id of ['wish-children', 'farm-expansion'])
          state.actionSpaces.find((space) => space.id === id)!.takenBy = [
            { playerId: state.players[1]!.id, workerId: '1' },
          ]
      }),
    )
    const response = autoAdvanceRoundEnd(session, {
      onChoice: (_interaction, current) => chooseBranch(current, current.getState()),
    })
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(3)
    expect(response.state.players[0]!.resources.food).toBe(15)
  })

  it('Lovers Tryst: replacement grows the family without transferring the starting-player marker', () => {
    const session = loversTrystSession(3, 2)
    const cardId = flCard(24).id
    let response = session.takeAction(0, 'meeting-place')
    const option = flOptions(response).find((candidate) => candidate.sourceCard === cardId)
    if (!option) throw new Error('Expected Lovers Tryst replacement')
    response = choose(session, response, option.value)
    response = choose(session, response, cardId)
    const [actor, opponent] = response.state.players
    expect(opponent!.startPlayer).toBe(true)
    expect(actor!.workers.filter((worker) => worker.isActive)).toHaveLength(3)
    const newborn = actor!.workers.find((worker) => worker.isNewborn)
    expect(newborn).toBeDefined()
    expect(actor!.minorHand).not.toContain(cardId)
    expect(opponent!.minorHand).toContain(cardId)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'card.passed', cardId, fromPlayerId: actor!.id, toPlayerId: opponent!.id,
    }))
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'worker.placed', workerId: newborn!.id,
    }))
    expect(response.state.events.some((event) => event.type === 'startPlayer.changed')).toBe(false)
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.familyGrowth', playerId: actor!.id }))
    expect(response.state.log).not.toContainEqual(expect.objectContaining({ key: 'log.startPlayer' }))
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(bonusScore(response, cardId)).toBe(0)
  })

  it.each([
    { missing: 'a spare room', rooms: 2, adults: 2 },
    { missing: 'a family member in supply', rooms: 6, adults: 5 },
  ])('Lovers Tryst: without $missing, it plays and passes normally through Meeting Place', ({ rooms, adults }) => {
    const session = loversTrystSession(rooms, 2, adults)
    const cardId = flCard(24).id
    let response = session.takeAction(0, 'meeting-place')
    expect(response.ok, response.error).toBe(true)
    expect(flOptions(response)).not.toContainEqual(expect.objectContaining({ sourceCard: cardId }))
    response = accept(session, response)
    const [actor, opponent] = response.state.players
    expect(actor!.startPlayer).toBe(true)
    expect(actor!.workers.filter((worker) => worker.isActive)).toHaveLength(adults)
    expect(actor!.minorHand).not.toContain(cardId)
    expect(opponent!.minorHand).toContain(cardId)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'startPlayer.changed', playerId: actor!.id,
    }))
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.startPlayer', playerId: actor!.id }))
    expect(response.state.log).not.toContainEqual(expect.objectContaining({ key: 'log.familyGrowth' }))
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(bonusScore(response, cardId)).toBe(0)
  })

  it('Lovers Tryst: a spare room alone does not make the card playable', () => {
    const session = loversTrystSession(3, 1)
    const cardId = flCard(24).id
    const response = session.takeAction(0, 'meeting-place')
    const [actor, opponent] = response.state.players
    expect(response.ok, response.error).toBe(true)
    expect(actor!.startPlayer).toBe(true)
    expect(actor!.workers.filter((worker) => worker.isActive)).toHaveLength(2)
    expect(actor!.minorHand).toContain(cardId)
    expect(opponent!.minorHand).not.toContain(cardId)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'startPlayer.changed', playerId: actor!.id,
    }))
    expect(response.state.log).not.toContainEqual(expect.objectContaining({ key: 'log.cardPassed' }))
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(bonusScore(response, cardId)).toBe(0)
  })

  it.each([false, true])('Wild Boar Hunt: an opponent’s later person is rejected=%s', (later) => {
    const session = keep(
      flSession((state) => {
        state.round = 10
        state.currentPlayerIndex = 1
        state.players[0]!.minorPlayed = [flCard(30).id]
        state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 1
        if (later) recordRoundPlacement(state.players[1]!, 'forest', '2')
      }),
    )
    const response = session.takeAction(1, 'pig-market')
    expect(response.ok).toBe(!later)
    expect(response.state.players[1]!.resources.boar).toBe(later ? 0 : 1)
  })

  it('Chaplain: the owner places a person during another player’s growth and then returns control', () => {
    const session = keep(
      flSession((state) => {
        state.round = 7
        state.currentPlayerIndex = 1
        state.players[0]!.occupationPlayed = [flCard(57).id]
        state.players[1]!.rooms = 3
        state.players[1]!.roomTiles.push({ row: 0, col: 0 })
      }),
    )
    let response = session.takeAction(1, 'wish-children')
    response = confirmTurns(session, response)
    response = chooseBranch(session, response)
    response = choose(session, response, 'forest')
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(response.state.players[1]!.workers.filter((worker) => worker.isActive)).toHaveLength(3)
    expect(
      response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy[0]?.playerId,
    ).toBe(response.state.players[0]!.id)
  })

  it.each([false, true])(
    'School Dropout: a later round-card placement prevents the extra newborn action=%s',
    (laterRoundSpace) => {
      const session = keep(
        flSession((state) => {
          state.round = 7
          const player = state.players[0]!
          player.occupationPlayed = [flCard(45).id]
          player.rooms = 3
          player.roomTiles.push({ row: 0, col: 0 })
          state.players.slice(1).forEach((other) => setWorkersAtHome(state, other, 0))
          reveal(state, 'wish-children')
          reveal(state, 'western-quarry')
          state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone = 1
        }),
      )
      confirmTurns(session, accept(session, session.takeAction(0, 'wish-children')))
      let response = session.takeAction(0, laterRoundSpace ? 'western-quarry' : 'grain-seeds')
      expect(response.ok, response.error).toBe(true)
      response = confirmTurns(session, response)
      if (laterRoundSpace) {
        expect(response.state.round).toBe(8)
        expect(response.state.players[0]!.resources.wood).toBe(0)
        expect(response.state.players[0]!.cardStates[flCard(45).id]?.flagged).not.toBe(true)
      } else {
        while (
          response.interaction.stateId === 'wait' &&
          !flOptions(response)?.some((option) => option.value === 'forest')
        ) {
          response = confirmTurns(session, chooseBranch(session, response))
        }
        response = choose(session, response, 'forest')
        expect(response.state.players[0]!.resources.wood).toBe(3)
        expect(
          response.state.players[0]!.workers.filter((worker) => worker.isNewborn),
        ).toHaveLength(0)
      }
    },
  )

  it.each([
    { timing: 'before', afterGrowth: false },
    { timing: 'after', afterGrowth: true },
  ])('School Dropout: a Large-Scale Farmer relocation $timing growth', ({ afterGrowth }) => {
    const schoolDropout = flCard(45).id
    const largeScaleFarmer = 'B150_LargeScaleFarmer'
    const session = keep(flSession((state) => {
      state.round = 7
      const player = state.players[0]!
      player.occupationPlayed = [schoolDropout, largeScaleFarmer]
      player.rooms = 4
      player.roomTiles = createDefaultRoomTiles(4)
      setActiveWorkerCount(player, 3)
      Object.assign(player.resources, { wood: 2, clay: 2, food: 1 })
      state.players.forEach((other, index) => {
        other.minorHand = ['__test_placeholder__']
        other.occupationHand = ['__test_placeholder__']
        if (index !== 0) {
          other.resources.food = 20
          setWorkersAtHome(state, other, 0)
        }
      })
      reveal(state, 'wish-children')
      reveal(state, 'major-improvement')
    }))
    const grow = () => {
      const response = confirmTurns(session, accept(session, session.takeAction(0, 'wish-children')))
      expect(response.state.players[0]!.workers.filter((worker) => worker.isNewborn)).toHaveLength(1)
      expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.familyGrowth' }))
    }

    if (afterGrowth) grow()
    let response = session.takeAction(0, 'farm-expansion')
    expect(response.ok, response.error).toBe(true)
    const placement = response.state.actionSpaces.find((space) => space.id === 'farm-expansion')!.takenBy[0]!
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const stable = flOptions(response).find((option) => option.labelKey === 'actions.stables.name')
      if (!stable) throw new Error('Expected the Build Stables choice')
      response = choose(session, response, stable.value)
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    const jump = flOptions(response).find((option) => option.sourceCard === largeScaleFarmer)
    if (!jump) throw new Error('Expected the Large-Scale Farmer relocation')
    response = choose(session, response, jump.value)
    if (!response.state.players[0]!.improvements.includes('Major_Fireplace1'))
      response = choose(session, response, 'Major_Fireplace1')
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'farm-expansion')!.takenBy).toEqual([])
    expect(response.state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy).toContainEqual(placement)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid', sourceCardId: largeScaleFarmer, resources: { food: 1 },
    }))
    confirmTurns(session, response)
    if (!afterGrowth) grow()

    response = confirmTurns(session, session.takeAction(0, 'grain-seeds'))
    expect(response.state.players[0]!.resources.grain).toBe(1)
    if (afterGrowth) {
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'feed' } })
      expect(response.state.events).not.toContainEqual(expect.objectContaining({
        type: 'worker.promoted', sourceCardId: schoolDropout,
      }))
      response = autoAdvanceRoundEnd(session, { initialResponse: response })
      expect(response.state.round).toBe(8)
    } else {
      expect(response.state.round).toBe(7)
      const use = flOptions(response).find((option) =>
        option.sourceCard === schoolDropout && option.labelKey !== 'ui.interactionDecline',
      )
      if (!use) throw new Error(`Expected the School Dropout extra turn: ${JSON.stringify(response.interaction)}`)
      response = choose(session, response, use.value)
      response = choose(session, response, 'forest')
      expect(response.state.players[0]!.workers.some((worker) => worker.isNewborn)).toBe(false)
      expect(response.state.players[0]!.resources.wood).toBe(3)
    }
    expect(bonusScore(response, schoolDropout)).toBe(0)
  })

  it('Pillar Biter: after an opponent fences, the owner builds four fences for three wood', () => {
    let session = keep(
      flSession((state) => {
        state.round = 3
        state.currentPlayerIndex = 1
        state.players[0]!.occupationPlayed = [flCard(59).id]
        state.players[0]!.resources.wood = 3
        state.players[1]!.resources.wood = 4
        reveal(state, 'fencing')
      }),
    )
    let response = session.takeAction(1, 'fencing')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(1, { edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'] })
    response = confirmTurns(session, response)
    chooseBranch(session, response)
    session = keep(restoreSession(session))
    response = session.commitSelectionChoice(0, { edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[1]!.fenceSegments).toHaveLength(4)
  })
})
