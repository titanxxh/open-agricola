import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { flOptions, fl, flSession, chooseBranch, confirmTurns } from './_helpers/classic-fl'
import {
  playImprovement,
  playOccupation,
  choose,
  restoreSession,
  bonusScore,
} from './_helpers/card-play-lifecycle'
import {
  setWorkersAtHome,
  setActiveWorkerCount,
  workersAvailable,
} from '../../shared/domain/player'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { autoAdvanceRoundEnd } from './_helpers/round-end'

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

describe('FL: compound actions and cross-player timing', () => {
  it('Farm Cart: sows the opposite crop into an occupied field with no ordinary sow targets', () => {
    const session = keep(
      flSession([1], (state) => {
        state.players[0]!.minorPlayed = [fl[1]!.id]
        state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }]
        state.players[0]!.resources.vegetable = 1
        reveal(state, 'grain-utilization')
      }),
    )
    const response = accept(session, session.takeAction(0, 'grain-utilization'))
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([
      { kind: 'grain', remaining: 2, fieldIdentity: 'grain', independentHarvest: true },
      { kind: 'vegetable', remaining: 1, fieldIdentity: 'grain', independentHarvest: true },
    ])
  })

  it('Ebony Shoe: another player finishing their farm receives the one-time bonus', () => {
    const session = keep(
      flSession([9], (state) => {
        state.players[0]!.minorPlayed = [fl[9]!.id]
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
    expect(bonusScore(response, fl[9]!.id, 1)).toBe(3)
    expect(bonusScore(response, fl[9]!.id, 0)).toBe(0)
    expect(response.state.players[0]!.cardStates[fl[9]!.id]?.flagged).toBe(true)
  })

  it('Stuck Cart: places remaining people in sequence and passes the card', () => {
    const session = keep(
      flSession([10], (state) => {
        const p = state.players[0]!
        setActiveWorkerCount(p, 4)
        setWorkersAtHome(state, p, 3)
        recordRoundPlacement(p, 'copse', '1')
        p.minorHand = [fl[10]!.id]
        p.resources.wood = 1
      }),
    )
    let response = session.takeAction(0, 'meeting-place')
    response = chooseBranch(session, response)
    if (
      response.interaction.stateId === 'wait' &&
      flOptions(response)?.some((option) => option.value === fl[10]!.id)
    )
      response = choose(session, response, fl[10]!.id)
    response = choose(session, response, 'forest')
    response = choose(session, response, 'clay-pit')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 1 })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain(fl[10]!.id)
  })

  it('Towhead: Family Growth moves to slot six and is exclusive to its owner in round five', () => {
    const session = keep(
      flSession([11], (state) => {
        state.round = 4
        const p = state.players[0]!
        p.minorHand = [fl[11]!.id]
        p.resources.wood = 1
        state.players.forEach((player) => {
          setWorkersAtHome(state, player, player.id === p.id ? 1 : 0)
          player.resources.food = 20
        })
      }),
    )
    let response = playImprovement(session, fl[11]!.id, 'meeting-place')
    expect(response.state.roundActionOrder[5]).toBe('wish-children')
    response = autoAdvanceRoundEnd(session, { initialResponse: response })
    expect(response.state.round).toBe(5)
    expect(
      response.state.actionSpaces.find((space) => space.id === 'wish-children')!.exclusiveUse,
    ).toMatchObject({ playerId: response.state.players[0]!.id, untilRound: 6 })
  })

  it('Love Garden: unrevealed later growth spaces do not block the end-of-work growth', () => {
    const session = keep(
      flSession([20], (state) => {
        state.round = 7
        state.players.forEach((player) => {
          setWorkersAtHome(state, player, 0)
          player.resources.food = 20
        })
        state.players[0]!.minorPlayed = [fl[20]!.id]
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
    const session = keep(
      flSession([24], (state) => {
        state.players[0]!.minorHand = [fl[24]!.id]
        state.players[0]!.occupationPlayed = ['A099_FellowGrazer', 'A100_Curator']
        state.players[0]!.rooms = 3
        state.players[0]!.roomTiles.push({ row: 0, col: 0 })
        state.players.forEach((p, index) => {
          p.startPlayer = index === 1
        })
      }),
    )
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') throw new Error('Expected replacement')
    const option = flOptions(response)?.find((option) => option.sourceCard === fl[24]!.id)
    expect(option).toBeDefined()
    response = choose(session, response, option!.value)
    response = accept(session, response)
    expect(response.state.players[1]!.startPlayer).toBe(true)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(3)
    expect(response.state.players[1]!.minorHand).toContain(fl[24]!.id)
    expect(response.state.events.some((event) => event.type === 'startPlayer.changed')).toBe(false)
  })

  it('Rough Baker: alternative oven recipe obeys its cap and cannot be combined with the original oven', () => {
    let session = keep(
      flSession([37], (state) => {
        state.players[0]!.occupationHand = [fl[37]!.id]
        state.players[0]!.improvements = ['Major_ClayOven']
        state.players[0]!.resources.grain = 2
        state.players[0]!.resources.food = 0
      }),
    )
    let response = playOccupation(session, fl[37]!.id)
    response = chooseBranch(session, response)
    const alternative = `${fl[37]!.id}:Major_ClayOven`
    session = keep(restoreSession(session))
    let rejected = session.resolveChoice(0, `bulk:Major_ClayOven=1,${alternative}=2`)
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources).toMatchObject({ grain: 3, food: 0 })
    rejected = session.resolveChoice(0, `bulk:${alternative}=3`)
    expect(rejected.ok).toBe(false)
    response = session.resolveChoice(0, `bulk:${alternative}=2`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 8 })
  })

  it('Speculoos Bakery: a baking action grants a guest even with all five family members active', () => {
    const session = keep(
      flSession([26], (state) => {
        state.players[0]!.minorPlayed = [fl[26]!.id]
        setActiveWorkerCount(state.players[0]!, 5)
        state.players[0]!.improvements = ['Major_ClayOven']
        state.players[0]!.resources.grain = 2
        reveal(state, 'grain-utilization')
      }),
    )
    const response = accept(session, session.takeAction(0, 'grain-utilization'))
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isGuest)).toHaveLength(1)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(5)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(5)
  })

  it.each([false, true])('Wild Boar Hunt: an opponent’s later person is rejected=%s', (later) => {
    const session = keep(
      flSession([30], (state) => {
        state.round = 10
        state.currentPlayerIndex = 1
        state.players[0]!.minorPlayed = [fl[30]!.id]
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
      flSession([57], (state) => {
        state.round = 7
        state.currentPlayerIndex = 1
        state.players[0]!.occupationPlayed = [fl[57]!.id]
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
        flSession([45], (state) => {
          state.round = 7
          const player = state.players[0]!
          player.occupationPlayed = [fl[45]!.id]
          player.rooms = 3
          player.roomTiles.push({ row: 0, col: 0 })
          state.players.slice(1).forEach((other) => setWorkersAtHome(state, other, 0))
          reveal(state, 'wish-children')
          reveal(state, 'western-quarry')
          state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone = 1
        }),
      )
      let response = accept(session, session.takeAction(0, 'wish-children'))
      response = confirmTurns(session, response)
      response = session.takeAction(0, laterRoundSpace ? 'western-quarry' : 'grain-seeds')
      expect(response.ok, response.error).toBe(true)
      response = confirmTurns(session, response)
      if (laterRoundSpace) {
        expect(response.state.round).toBe(8)
        expect(response.state.players[0]!.resources.wood).toBe(0)
        expect(response.state.players[0]!.cardStates[fl[45]!.id]?.flagged).not.toBe(true)
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

  it('Pillar Biter: after an opponent fences, the owner builds four fences for three wood', () => {
    let session = keep(
      flSession([59], (state) => {
        state.round = 3
        state.currentPlayerIndex = 1
        state.players[0]!.occupationPlayed = [fl[59]!.id]
        state.players[0]!.resources.wood = 3
        state.players[1]!.resources.wood = 4
        reveal(state, 'fencing')
      }),
    )
    let response = session.takeAction(1, 'fencing')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(1, { edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'] })
    response = confirmTurns(session, response)
    response = chooseBranch(session, response)
    session = keep(restoreSession(session))
    response = session.commitSelectionChoice(0, { edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[1]!.fenceSegments).toHaveLength(4)
  })
})
