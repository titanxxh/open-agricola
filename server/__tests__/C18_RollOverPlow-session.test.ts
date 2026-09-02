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

  it('discards crops from a selected Card Field before plowing', () => {
    const session = setup({ includeCardField: true })
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
