import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C018_RollOverPlow'
import '../../shared/cards/B/B113_PatchCaregiver'
import type { AnytimeAction } from '../../shared/contract/types';

const CARD_ID = 'C018_RollOverPlow'

describe('C018_RollOverPlow session', () => {
  const setup = (options?: { includeEmptyField?: boolean; includeCardField?: boolean }) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // 3 planted fields
    player.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 1, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]
    if (options?.includeEmptyField) {
      player.fields.push({ row: 1, col: 3, stacks: [] })
    }
    if (options?.includeCardField) {
      player.occupationPlayed.push('B113_PatchCaregiver')
      player.cardStates.B113_PatchCaregiver = {
        extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] },
      }
    }

    session.loadState(state)
    return session
  }

  /** Take farmland action to enter active interaction */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  it('available with 3+ planted fields', () => {
    const session = setup()
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).toContain('C18-roll-over-plow-anytime')
  })

  it('select field 0-2 discards grain and then plow interaction starts', () => {
    const session = setup()
    enterActiveInteraction(session)

    // Take the anytime action
    let resp = session.takeAnytimeAction(0, 'C18-roll-over-plow-anytime')
    expect(resp.ok).toBe(true)

    // Should be in selection choice
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)

    // Select field 0-2 (grain with remaining 3)
    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(resp.ok).toBe(true)

    // After selection resolves, plow action should start
    // Plow shows a farm interaction for tile selection
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected plow choice')
    expect(resp.interaction.promptKey).toBe('ui.interactionPlowSelect')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)

    // Verify the field was discarded
    const p = resp.state.players[0]!
    const f = p.fields.find(f => f.row === 0 && f.col === 2)!
    expect(f.stacks[0]?.kind ?? null).toBeNull()
    expect(f.stacks[0]?.remaining ?? 0).toBe(0)

    // Commit the plow choice
    const tile = resp.interaction.request.farm.selectableTiles[0]
    expect(tile).toBeDefined()
    resp = session.commitSelectionChoice(0, { tile })
    expect(resp.ok).toBe(true)

    // Should have gained a new field from plowing
    expect(resp.state.players[0]!.fields.length).toBe(4)
  })

  it('rejects empty discard selection before plow interaction starts', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'C18-roll-over-plow-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
    expect(resp.interaction.promptKey).toBe('ui.interactionSelection')

    resp = session.commitSelectionChoice(0, { positions: [] })

    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('not enough selection positions')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
    expect(resp.interaction.promptKey).toBe('ui.interactionSelection')
    const player = resp.state.players[0]!
    expect(player.fields).toHaveLength(3)
    expect(player.fields.find(f => f.row === 0 && f.col === 2)?.stacks[0]).toEqual({
      kind: 'grain',
      remaining: 3,
    })
  })

  it.each([false, true])('discards all crops from a selected Card Field before plowing, with buried crops: %s', (buried) => {
    const session = setup({ includeCardField: true })
    if (buried) {
      session.state.players[0]!.cardStates.B113_PatchCaregiver = {
        extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2, below: [{ crop: 'vegetable', remaining: 1 }] }] },
      }
    }
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'C18-roll-over-plow-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
    expect(resp.interaction.request.kind).toBe('selection')
    if (resp.interaction.request.kind !== 'selection') throw new Error('expected selection request')
    expect(resp.interaction.request.selection.selectablePositions).toContainEqual(
      expect.objectContaining({ row: -1, col: 2113, sourceCard: 'B113_PatchCaregiver' }),
    )

    resp = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 2113 }] })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionPlowSelect')
    expect(resp.state.players[0]!.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks)
      .toEqual([null])
  })

  it('rejects selecting an empty field for discard before plow interaction starts', () => {
    const session = setup({ includeEmptyField: true })
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'C18-roll-over-plow-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
    expect(resp.interaction.promptKey).toBe('ui.interactionSelection')

    resp = session.commitSelectionChoice(0, { positions: [{ row: 1, col: 3 }] })

    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('invalid selection position')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
    expect(resp.interaction.promptKey).toBe('ui.interactionSelection')
    const player = resp.state.players[0]!
    expect(player.fields).toHaveLength(4)
    expect(player.fields.find(f => f.row === 1 && f.col === 3)?.stacks).toEqual([])
    expect(player.fields.find(f => f.row === 0 && f.col === 2)?.stacks[0]).toEqual({
      kind: 'grain',
      remaining: 3,
    })
  })

  it('NOT available with < 3 planted fields', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Only 2 planted fields
    player.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]

    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('C18-roll-over-plow-anytime')
  })
})

describe('C018 Roll-Over Plow parity', () => {
  const CARD_ID = 'C018_RollOverPlow'

  const ANYTIME_ID = 'C18-roll-over-plow-anytime'

  const setup = ({
    played = true,
    planted = [3, 2, 1],
    cardField = false,
    empty = false,
  }: {
    played?: boolean
    planted?: number[]
    cardField?: boolean
    empty?: boolean
  } = {}) => {
    const session = new GameSession(18, undefined, { playerCount: 3 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources = { ...player.resources, wood: played ? 0 : 2 }
    player.minorHand = played ? ['__test_placeholder__'] : [CARD_ID]
    player.minorPlayed = played ? [CARD_ID] : []
    player.fields = planted.map((remaining, index) => ({
      row: 0, col: index + 2,
      stacks: [{ kind: index === 1 ? 'vegetable' as const : 'grain' as const, remaining }],
    }))
    if (empty) player.fields.push({ row: 1, col: 2, stacks: [] })
    if (cardField) {
      player.occupationPlayed = ['B113_PatchCaregiver']
      player.cardStates.B113_PatchCaregiver = {
        extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] },
      }
    }

    session.loadState(state)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    return response
  }

  const startRollOverPlow = (session: GameSession, response: SessionResponse) => {
    expect(response.interaction.anytimeActions.map((action) => action.id)).toContain(ANYTIME_ID)
    const next = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(next.ok, next.error).toBe(true)
    expect(next.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'selection' } })
    return next
  }

  it('C018 S5: an empty field is not selectable and an invalid submission leaves a legal retry', () => {
    const session = setup({ empty: true })
    let response = startRollOverPlow(session, enterActiveInteraction(session))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'selection') return
    expect(response.interaction.request.selection.selectablePositions)
      .not.toContainEqual(expect.objectContaining({ row: 1, col: 2 }))

    const rejected = session.commitSelectionChoice(0, { positions: [{ row: 1, col: 2 }] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.fields.find((field) =>
      field.row === 0 && field.col === 2)?.stacks).toEqual([{ kind: 'grain', remaining: 3 }])

    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    expect(response.state.players[0]!.fields.find((field) =>
      field.row === 0 && field.col === 2)?.stacks).toEqual([])
  })
})
