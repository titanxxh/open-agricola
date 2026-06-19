import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeScores } from '../../shared/domain/scoring'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { emptyResources } from '../../shared/session/state-bootstrap'
import type { FatherParentCardId, MotherParentCardId } from '../../shared/parents/types'

const placeholderHands = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources = { ...emptyResources }
  })
  session.loadState(state)
}

const chooseParents = (
  session: GameSession,
  mothers: [MotherParentCardId, MotherParentCardId],
  fathers: [FatherParentCardId, FatherParentCardId] = ['PS01', 'PS02'],
) => {
  const state = session.getState().state
  state.parentSelection!.candidates.p1 = { mother: [mothers[0], 'PR04'], father: [fathers[0], 'PS03'] }
  state.parentSelection!.candidates.p2 = { mother: [mothers[1], 'PR05'], father: [fathers[1], 'PS04'] }
  session.loadState(state)

  expect(session.submitParentSelection(0, {
    mother: mothers[0],
    father: fathers[0],
  }).ok).toBe(true)
  return session.submitParentSelection(1, {
    mother: mothers[1],
    father: fathers[1],
  })
}

const setupParentSession = (
  mothers: [MotherParentCardId, MotherParentCardId],
) => {
  const session = new GameSession(309, undefined, {
    playerCount: 2,
    enableParentCards: true,
  } as never)
  placeholderHands(session)
  const resp = chooseParents(session, mothers)
  return { session, resp }
}

const startRound = (session: GameSession, round: number) => {
  const state = session.getState().state
  state.round = round
  state.roundPhase = 'preparation'
  state.currentPlayerIndex = 0
  session.loadState(state)
  return (session as unknown as { continueBeforeStartOfTurn: () => ReturnType<GameSession['takeAction']> }).continueBeforeStartOfTurn()
}

describe('Parent Cards mother rewards', () => {
  it('settles round 1 resource rewards before the first normal action', () => {
    const { resp } = setupParentSession(['PR10', 'PR11'])

    expect(resp.ok).toBe(true)
    expect(resp.state.phase).toBe('playing')
    expect(resp.state.round).toBe(1)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.players[1]!.resources.food).toBe(1)
  })

  it('does not settle mother rewards when parent cards are disabled', () => {
    const session = new GameSession(309, undefined, { playerCount: 2 } as never)
    placeholderHands(session)
    const state = session.getState().state
    state.players[0]!.parentCards.mother = 'PR10'
    session.loadState(state)

    const resp = startRound(session, 1)

    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })

  it('settles later resource and animal rewards at the matching round start', () => {
    const { session } = setupParentSession(['PR03', 'PR09'])

    const resp = startRound(session, 8)

    expect(resp.state.players[0]!.resources.cattle).toBe(1)
    expect(resp.state.players[1]!.resources.reed).toBe(0)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected cattle reorg')
    expect(resp.interaction.request.kind).toBe('animal-reorg')
  })

  it('uses a backend farm-select to place PR02 free fields', () => {
    const { session } = setupParentSession(['PR02', 'PR10'])

    const optional = startRound(session, 12)

    expect(optional.interaction.stateId).toBe('wait')
    expect(optional.interaction.stateId === 'wait' ? optional.interaction.promptKey : undefined)
      .toBe('ui.interactionOptionalAction')
    if (optional.interaction.stateId !== 'wait') throw new Error('expected optional future action')
    const accept = optional.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    const prompt = session.resolveChoice(0, accept!.value)

    expect(prompt.interaction.stateId).toBe('wait')
    if (prompt.interaction.stateId !== 'wait') throw new Error('expected farm-select')
    expect(prompt.interaction.request.kind).toBe('farm-select')
    expect(prompt.interaction.farm.farmType).toBe('plow')

    const [field] = prompt.interaction.farm.selectableTiles
    const built = session.commitSelectionChoice(0, { tile: field })

    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.fields).toEqual(expect.arrayContaining([
      expect.objectContaining(field!),
    ]))

    const repeated = startRound(session, 12)
    expect(repeated.interaction.stateId).toBe('idle')
  })

  it('reserves PR01 stable supply through future meeples and places the free stable through backend selection', () => {
    const { session } = setupParentSession(['PR01', 'PR10'])
    const selected = session.getState().state

    expect(selected.futureMeeples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardId: 'PR01',
        playerId: 'p1',
        round: 2,
        resources: { stable: 1 },
      }),
    ]))
    expect(selected.players[0]!.supplyTokensConsumed?.stable ?? 0).toBe(0)
    expect(getAvailableStableSupplyCount(selected, selected.players[0]!)).toBe(3)

    const optional = startRound(session, 2)

    expect(optional.interaction.stateId).toBe('wait')
    expect(optional.interaction.stateId === 'wait' ? optional.interaction.promptKey : undefined)
      .toBe('ui.interactionOptionalAction')
    if (optional.interaction.stateId !== 'wait') throw new Error('expected optional future action')
    const accept = optional.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    const prompt = session.resolveChoice(0, accept!.value)

    expect(prompt.interaction.stateId).toBe('wait')
    if (prompt.interaction.stateId !== 'wait') throw new Error('expected farm-select')
    expect(prompt.interaction.request.kind).toBe('farm-select')
    expect(prompt.interaction.farm.farmType).toBe('stable')

    const [stable] = prompt.interaction.farm.selectableTiles
    const built = session.commitSelectionChoice(0, { stables: [stable] })

    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.stableTiles).toContainEqual(stable)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(getAvailableStableSupplyCount(built.state, built.state.players[0]!)).toBe(3)
  })

  it('scores mother fractional points in a dedicated parentCards category', () => {
    const { resp } = setupParentSession(['PR10', 'PR01'])

    const scores = computeScores(resp.state)
    const p1 = scores.find((score) => score.playerId === 'p1')!
    const parentCards = p1.categories.find((category) => category.key === 'parentCards')

    expect(parentCards).toEqual({
      key: 'parentCards',
      total: 0.7,
      entries: [{ type: 'parentCard', cardId: 'PR10', score: 0.7 }],
    })
    expect(Number.isInteger(p1.total)).toBe(false)
  })
})
