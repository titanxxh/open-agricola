import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  flOptions,
  fl,
  flSession,
  chooseBranch,
  confirmTurns,
  takeFlAnytime,
} from './_helpers/classic-fl'
import { playImprovement, choose, restoreSession } from './_helpers/card-play-lifecycle'
import {
  setWorkersAtHome,
  setActiveWorkerCount,
  familySize,
  workersAvailable,
} from '../../shared/domain/player'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { getClassicAdjacentSpaceIds } from '../../shared/cards/helpers/classic-board-topology'

const sessions: GameSession[] = []
const keep = (session: GameSession) => {
  sessions.push(session)
  return session
}
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

describe('FL: real work-phase placement', () => {
  it('Beguine Courtyard: completes the five-room C and activates all remaining adults on purchase', () => {
    const session = keep(
      flSession([2], (state) => {
        const p = state.players[0]!
        p.minorHand = [fl[2]!.id]
        p.roomTiles = [
          { row: 0, col: 0 },
          { row: 1, col: 0 },
          { row: 2, col: 0 },
          { row: 0, col: 1 },
          { row: 2, col: 1 },
        ]
        p.rooms = 5
        Object.assign(p.resources, { clay: 2, stone: 2 })
      }),
    )
    const response = playImprovement(session, fl[2]!.id, 'meeting-place')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(5)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(4)
    expect(response.state.players[0]!.workers.some((worker) => worker.isNewborn)).toBe(false)
  })

  it.each([false, true])(
    'Educational Building: the third person is eligible only on their first-ever placement (%s)',
    (previouslyWorked) => {
      const session = keep(
        flSession([4], (state) => {
          const p = state.players[0]!
          p.minorPlayed = [fl[4]!.id]
          setActiveWorkerCount(p, 3)
          setWorkersAtHome(state, p, 1)
          if (previouslyWorked) p.workers[2]!.firstWorkPlacement = { spaceId: 'forest' }
        }),
      )
      const response = session.takeAction(0, fl[4]!.id)
      expect(response.ok, response.error).toBe(!previouslyWorked)
      if (!previouslyWorked) {
        const future = response.state.futureMeeples.filter((entry) => entry.cardId === fl[4]!.id)
        expect(
          future,
          JSON.stringify({
            interaction: response.interaction,
            card: response.state.players[0]!.cardStates,
            events: response.state.events.slice(-8),
          }),
        ).toHaveLength(13)
        expect(future.slice(0, 2).map((entry) => entry.resources)).toEqual([
          { wood: 1 },
          { stone: 1 },
        ])
      }
    },
  )

  it('Wooden Draisine: one person occupies adjacent spaces, leaves one on each, and survives restore', () => {
    let session = keep(
      flSession([8], (state) => {
        state.players[0]!.minorPlayed = [fl[8]!.id]
        state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 4
        state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
      }),
    )
    expect(getClassicAdjacentSpaceIds(session.state, 'forest')).toContain('clay-pit')
    let response = takeFlAnytime(session, 8, 'two-spaces')
    if (response.interaction.stateId !== 'wait') throw new Error('Expected pair selection')
    const pair = flOptions(response)?.find(
      (option) =>
        option.value.includes('"first":"forest"') && option.value.includes('"second":"clay-pit"'),
    )
    expect(pair).toBeDefined()
    session = keep(restoreSession(session))
    response = choose(session, session.getState(), pair!.value)
    if (
      response.interaction.stateId === 'wait' &&
      flOptions(response)?.some((option) => option.value === 'forest')
    )
      response = choose(session, response, 'forest')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(
      1,
    )
    expect(
      response.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay,
    ).toBe(1)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(
      response.state.actionSpaces.find((space) => space.id === 'clay-pit')!.takenBy,
    ).toHaveLength(1)
  })

  it('Janneken Pis: restores the Well action and schedules a second five-round food stream', () => {
    let session = keep(
      flSession([16], (state) => {
        state.players[0]!.minorPlayed = [fl[16]!.id]
        state.players[0]!.improvements = ['Major_Well']
      }),
    )
    session = keep(restoreSession(session))
    const id = `${fl[16]!.id}:Major_Well`
    expect(session.state.actionSpaces.some((space) => space.id === id)).toBe(true)
    const response = session.takeAction(0, id)
    expect(response.ok, response.error).toBe(true)
    const scheduled = response.state.futureMeeples.filter((entry) => entry.cardId === 'Major_Well')
    expect(scheduled).toHaveLength(5)
    expect(scheduled.every((entry) => entry.resources?.food === 1)).toBe(true)
    expect(session.takeAction(1, id).ok).toBe(false)
  })

  it('Bobbin Table: occupied spaces become legal for its owner and stay illegal for opponents', () => {
    const session = keep(
      flSession([17], (state) => {
        state.players[0]!.minorPlayed = [fl[17]!.id]
        state.players[0]!.cardStates[fl[17]!.id] = { flagged: true }
        state.actionSpaces.find((space) => space.id === 'forest')!.takenBy = [
          { playerId: state.players[1]!.id, workerId: state.players[1]!.workers[0]!.id },
        ]
        state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
      }),
    )
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(
      response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy,
    ).toHaveLength(2)
  })

  it('Cockaigne: skipping the next entire work phase grants seven points and prevents placements', () => {
    const session = keep(
      flSession([25], (state) => {
        state.players.forEach((player) => {
          setWorkersAtHome(state, player, 0)
          player.resources.food = 20
        })
        state.players[0]!.minorPlayed = [fl[25]!.id]
        Object.assign(state.players[0]!.resources, {
          grain: 1,
          vegetable: 1,
          sheep: 1,
          boar: 1,
          stone: 1,
        })
        state.players[0]!.stableTiles = [{ row: 0, col: 1 }]
        state.players[0]!.stableAnimals = { '0-1': { animalType: 'boar', animalCount: 1 } }
        state.players[0]!.houseAnimals = { '1-0': 'sheep' }
      }),
    )
    let response = session.performRoundEnd()
    response = autoAdvanceRoundEnd(session, {
      initialResponse: response,
      onChoice: (_interaction, current) => chooseBranch(current, current.getState()),
    })
    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.cardStates[fl[25]!.id]?.counters?.bonusVp).toBe(7)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(session.takeAction(0, 'forest').ok).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({
      grain: 1,
      vegetable: 1,
      sheep: 1,
      boar: 1,
      stone: 1,
    })
  })

  it('Flemish Patriot: the first placement in an even round leaves food that another player can claim', () => {
    const session = keep(
      flSession([56], (state) => {
        state.round = 2
        state.players[0]!.occupationPlayed = [fl[56]!.id]
        state.players.forEach((player) => {
          player.resources.food = 0
        })
      }),
    )
    let response = confirmTurns(session, session.takeAction(0, 'forest'))
    expect(response.state.players[0]!.resources.food).toBe(1)
    response = confirmTurns(session, session.takeAction(1, 'clay-pit'))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.food).toBe(1)
    expect(
      response.state.players[0]!.cardStates[fl[56]!.id]?.extraData?.actionSpaceAttachments,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ spaceId: 'clay-pit' })]))
  })
})
