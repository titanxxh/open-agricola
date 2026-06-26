import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { FarmTilePosition, GameState, PlayerState, Resource } from '../../shared/contract/types'
import { M045_TreeNursery } from '../../shared/cards/M/M045_TreeNursery'

const FILLER = '__test_placeholder__'

const baseResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  fuel: 0,
  horse: 0,
})

const prepareState = (state: GameState, round: number) => {
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.resources = baseResources()
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.improvements = []
    player.minorPlayed = []
    player.occupationPlayed = []
    player.rooms = 2
    player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.farmTerrain = [
      { row: 1, col: 0, kind: 'moor' },
      { row: 1, col: 1, kind: 'forest' },
    ]
    setActiveWorkerCount(player, index === 0 ? 2 : 0)
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
}

const setup = (round = 1) => {
  const session = new GameSession(378, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  prepareState(session.state, round)
  session.loadState(session.state)
  return { session, state: session.state, player: session.state.players[0]! }
}

const resolvePaymentIfNeeded = (
  session: GameSession,
  resp: ReturnType<GameSession['resolveChoice']>,
) => {
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const option = resp.interaction.options?.[0]
    expect(option).toBeDefined()
    return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
  }
  return resp
}

const playMinor = (session: GameSession, cardId: string) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const improvement = resp.interaction.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) {
    resp = session.resolveChoice(0, improvement.value)
    expect(resp.ok).toBe(true)
  }
  resp = resolvePaymentIfNeeded(session, resp)
  if (session.state.players[0]!.minorPlayed.includes(cardId)) return resp
  if (resp.interaction.stateId === 'wait' && resp.interaction.sourceCard === cardId) return resp
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const card = resp.interaction.options?.find((option) => option.value === `minor:${cardId}`)
  expect(card).toBeDefined()
  resp = session.resolveChoice(0, card!.value)
  expect(resp.ok).toBe(true)
  return resolvePaymentIfNeeded(session, resp)
}

const readyForRoundEnd = (state: GameState) => {
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
}

const acceptFuture = (
  session: GameSession,
  resp: ReturnType<GameSession['performRoundEnd']>,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
  const option = resp.interaction.options?.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
}

const skipFuture = (
  session: GameSession,
  resp: ReturnType<GameSession['performRoundEnd']>,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
}

const commitTerrain = (
  session: GameSession,
  resp: ReturnType<GameSession['resolveChoice']>,
  positions: FarmTilePosition[],
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(resp.interaction.selection?.kind).toBe('farm-position')
  return session.commitSelectionChoice(resp.interaction.playerIndex ?? 0, { positions })
}

const findSpecialCard = (
  session: GameSession,
  actionId: string,
) => session.state.farmersOfTheMoor!.specialActionCards.find((card) =>
  card.actions.includes(actionId as never),
)!

const takeCutPeat = (session: GameSession) => {
  const player = session.state.players[0]!
  const tile = player.farmTerrain!.find((entry) => entry.kind === 'moor')!
  return session.takeSpecialAction(0, findSpecialCard(session, 'cut-peat').id, 'cut-peat', { tile })
}

describe('Moor future terrain minor cards', () => {
  it('M044 schedules an optional moor on round 12', () => {
    const { session, player } = setup(4)
    player.minorHand = ['M044_Swamp']
    playMinor(session, 'M044_Swamp')

    expect(session.state.futureMeeples).toEqual([
      expect.objectContaining({
        cardId: 'M044_Swamp',
        playerId: player.id,
        round: 12,
        resources: { moor: 1 },
      }),
    ])
  })

  it('M045 requires no improvements and schedules optional forests on rounds 12 and 13', () => {
    const { session, player } = setup()
    expect(meetsCardPrerequisites(player, M045_TreeNursery, session.state.round, session.state)).toBe(true)
    player.improvements = ['Major_Well']
    expect(meetsCardPrerequisites(player, M045_TreeNursery, session.state.round, session.state)).toBe(false)
    player.improvements = []
    player.resources.wood = 1
    player.minorHand = ['M045_TreeNursery']
    playMinor(session, 'M045_TreeNursery')

    expect(session.state.futureMeeples).toEqual([
      expect.objectContaining({ cardId: 'M045_TreeNursery', round: 12, resources: { forest: 1 } }),
      expect.objectContaining({ cardId: 'M045_TreeNursery', round: 13, resources: { forest: 1 } }),
    ])
  })

  it('M049 schedules field, moor, and forest future placements', () => {
    const { session } = setup(2)
    const player = session.state.players[0]!
    player.resources.vegetable = 2
    player.minorHand = ['M049_SurveyorsMap']
    playMinor(session, 'M049_SurveyorsMap')

    expect(session.state.futureMeeples).toEqual([
      expect.objectContaining({ cardId: 'M049_SurveyorsMap', round: 11, resources: { field: 1 } }),
      expect.objectContaining({ cardId: 'M049_SurveyorsMap', round: 12, resources: { moor: 1 } }),
      expect.objectContaining({ cardId: 'M049_SurveyorsMap', round: 13, resources: { forest: 1 } }),
    ])
  })

  it('resolved and skipped future terrain entries disappear', () => {
    const { session, state, player } = setup(1)
    state.futureMeeples = [
      {
        id: 'future-moor',
        cardId: 'M044_Swamp',
        playerId: player.id,
        round: 2,
        actionId: null,
        resources: { moor: 1 },
      },
    ]
    readyForRoundEnd(state)
    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.state.futureMeeples).toEqual([])
    resp = commitTerrain(session, acceptFuture(session, resp), [{ row: 1, col: 2 }])
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.farmTerrain).toContainEqual({ row: 1, col: 2, kind: 'moor' })
    expect(resp.state.futureMeeples).toEqual([])

    const skipped = setup(1)
    const skipPlayer = skipped.state.players[0]!
    skipped.state.futureMeeples = [
      {
        id: 'future-forest',
        cardId: 'M045_TreeNursery',
        playerId: skipPlayer.id,
        round: 2,
        actionId: null,
        resources: { forest: 1 },
      },
    ]
    readyForRoundEnd(skipped.state)
    skipped.session.loadState(skipped.state)
    resp = skipped.session.performRoundEnd()
    resp = skipFuture(skipped.session, resp)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.farmTerrain).toEqual(skipPlayer.farmTerrain)
    expect(resp.state.futureMeeples).toEqual([])
  })

  it('rejects illegal future terrain placement positions', () => {
    const { session, state, player } = setup(1)
    state.futureMeeples = [
      {
        id: 'future-moor',
        cardId: 'M044_Swamp',
        playerId: player.id,
        round: 2,
        actionId: null,
        resources: { moor: 1 },
      },
    ]
    readyForRoundEnd(state)
    session.loadState(state)
    const select = acceptFuture(session, session.performRoundEnd())
    const rejected = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 0 }] })

    expect(select.interaction.stateId).toBe('wait')
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.farmTerrain).not.toContainEqual({ row: 0, col: 0, kind: 'moor' })
  })

  it('revalidates future terrain positions after an earlier same-round placement', () => {
    const { session, state, player } = setup(1)
    state.futureMeeples = [
      {
        id: 'future-moor',
        cardId: 'M044_Swamp',
        playerId: player.id,
        round: 2,
        actionId: null,
        resources: { moor: 1 },
      },
      {
        id: 'future-forest',
        cardId: 'M049_SurveyorsMap',
        playerId: player.id,
        round: 2,
        actionId: null,
        resources: { forest: 1 },
      },
    ]
    readyForRoundEnd(state)
    session.loadState(state)

    let resp = session.performRoundEnd()
    resp = commitTerrain(session, acceptFuture(session, resp), [{ row: 1, col: 2 }])
    expect(resp.state.players[0]!.farmTerrain).toContainEqual({ row: 1, col: 2, kind: 'moor' })

    resp = acceptFuture(session, resp)
    const rejected = session.commitSelectionChoice(0, { positions: [{ row: 1, col: 2 }] })
    expect(rejected.ok).toBe(false)
    resp = commitTerrain(session, resp, [{ row: 1, col: 3 }])
    expect(resp.state.players[0]!.farmTerrain).toContainEqual({ row: 1, col: 3, kind: 'forest' })
    expect(resp.state.futureMeeples).toEqual([])
  })

  it('delivers future fuel and horses through the round-start receive flow', () => {
    const { session, state, player } = setup(1)
    state.futureMeeples = [
      {
        id: 'future-fom-resources',
        cardId: 'M075_FuelStorage',
        playerId: player.id,
        round: 2,
        actionId: null,
        resources: { fuel: 1, horse: 1 },
      },
    ]
    readyForRoundEnd(state)
    session.loadState(state)

    const resp = session.performRoundEnd()
    expect(resp.state.players[0]!.resources.fuel).toBe(1)
    expect(resp.state.players[0]!.resources.horse).toBe(1)
    expect(resp.state.futureMeeples).toEqual([])
  })

  it('M048 schedules a future forest from the Cut Peat special-action dispatcher and drops past round 14', () => {
    const { session, player } = setup(10)
    player.minorPlayed.push('M048_ForestSwamp')
    let resp = takeCutPeat(session)

    expect(resp.ok).toBe(true)
    expect(resp.state.futureMeeples).toEqual([
      expect.objectContaining({
        cardId: 'M048_ForestSwamp',
        playerId: player.id,
        round: 14,
        resources: { forest: 1 },
      }),
    ])

    const late = setup(11)
    late.player.minorPlayed.push('M048_ForestSwamp')
    resp = takeCutPeat(late.session)
    expect(resp.ok).toBe(true)
    expect(resp.state.futureMeeples.some((entry) => entry.cardId === 'M048_ForestSwamp')).toBe(false)
  })
})
