import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/D/D071_Changeover'
import '../../shared/cards/D/D075_WoodField'
import type { ActionChoiceOption, AnytimeAction } from '../../shared/contract/types'

describe('D071_Changeover session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2
    state.roundPhase = 'work'
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed.push('D071_Changeover')

    // One eligible field (remaining === 1), one not eligible (remaining === 2)
    player.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },    // eligible
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] }, // not eligible
    ]
    player.resources.grain = 2 // for sow action

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

  it('characterizes OA: offers the action for exactly 1 remaining without a harvest origin', () => {
    const session = setup()
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).toContain('D71-changeover-anytime')
    expect(resp.state.harvestReapSummary).toBeUndefined()
  })

  it('characterizes OA: a card field reduced to exactly 1 by harvest is not offered', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.food = 10
      setActiveWorkerCount(player, 1)
      markAllWorkersUsed(state, player)
    }
    const player = state.players[0]!
    player.minorPlayed.push('D071_Changeover', 'D075_WoodField')
    player.fields = []
    player.resources.wood = 0
    player.cardStates.D075_WoodField = {
      extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 2 }] },
    }
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.cardStates.D075_WoodField?.extraData?.cardFieldStacks).toEqual([
      { crop: 'wood', remaining: 1 },
    ])
    expect(response.interaction.anytimeActions.map((action) => action.id))
      .not.toContain('D71-changeover-anytime')
  })

  it.each([
    { round: 4, finalHarvest: false, sow: true },
    { round: 4, finalHarvest: false, sow: false },
    { round: 14, finalHarvest: true, sow: true },
  ])('can act after reap and resume after sow=$sow in round $round', ({ round, finalHarvest, sow }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.players.forEach((player, index) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.startPlayer = index === 0
      player.resources.food = 10
      setActiveWorkerCount(player, 1)
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.minorPlayed.push('D071_Changeover')
    player.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 3, stacks: [] },
    ]
    player.resources.grain = 0

    session.loadState(state)
    let resp = session.performRoundEnd()

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.roundPhase).toBe('harvest')
    expect(resp.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(resp.interaction.anytimeActions.map((action) => action.id))
      .toContain('D71-changeover-anytime')

    resp = session.takeAnytimeAction(0, 'D71-changeover-anytime')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionOptionalAction')

    const sowOption = resp.interaction.stateId === 'wait'
      ? resp.interaction.request.options?.find((option) => option.value !== '__skip__')
      : undefined
    expect(sowOption).toBeDefined()
    if (sow) {
      resp = session.resolveChoice(0, sowOption!.value)
      const selectableFields = resp.interaction.stateId === 'wait' &&
        resp.interaction.request.kind === 'farm-select' &&
        resp.interaction.request.farm.farmType === 'sow'
        ? resp.interaction.request.farm.selectableFields.map((field) => field.tile)
        : []
      expect(selectableFields).toEqual([{ row: 0, col: 2 }])
      resp = session.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 2, crop: 'grain' }],
      })
      expect(resp.state.players[0]!.fields[0]!.stacks[0]).toMatchObject({
        kind: 'grain',
        remaining: 3,
      })
    } else {
      resp = session.resolveChoice(0, '__skip__')
      expect(resp.state.players[0]!.fields[0]!.stacks).toEqual([])
    }
    expect(resp.state.players[0]!.resources.begging).toBe(0)
    expect(resp.state.log.some((entry) => entry.key === 'log.reapDetail')).toBe(true)
    expect(resp.state.gameOver).toBe(finalHarvest)
    if (finalHarvest) expect(resp.scores).toHaveLength(2)
    if (!finalHarvest) {
      expect(resp.state.round).toBe(5)
      expect(resp.state.roundPhase).toBe('work')
    }
  })

  it('select field 0-2 discards crop, then sow interaction follows', () => {
    const session = setup()
    enterActiveInteraction(session)

    // Take the anytime action
    let resp = session.takeAnytimeAction(0, 'D71-changeover-anytime')
    expect(resp.ok).toBe(true)

    // Should be in selection choice
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')

    // Select field 0-2 (grain with remaining 1)
    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(resp.ok).toBe(true)

    // After selection, verify the field was discarded
    const p = resp.state.players[0]!
    const f = p.fields.find(f => f.row === 0 && f.col === 2)!
    expect(f.stacks[0]?.kind ?? null).toBeNull()
    expect(f.stacks[0]?.remaining ?? 0).toBe(0)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected optional sow prompt')
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.request.options?.map((o) => o.value)).toContain('__skip__')

    const acceptOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionSowSelect')
    expect(resp.interaction.stateId === 'wait'
      ? resp.interaction.request.options?.map((option) => option.value)
      : [],
    ).toEqual(['confirm'])

    const rejected = session.commitSelectionChoice(0, { cancel: true })
    expect(rejected.ok).toBe(false)
    expect(rejected.ok ? '' : rejected.error).toBe('action cancel is not allowed')
    expect(rejected.interaction.stateId === 'wait' ? rejected.interaction.promptKey : undefined)
      .toBe('ui.interactionSowSelect')

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    const sownField = resp.state.players[0]!.fields.find(f => f.row === 0 && f.col === 2)!
    expect(sownField.stacks[0]?.kind).toBe('grain')
    expect(sownField.stacks[0]?.remaining ?? 0).toBe(3)
  })

  it('NOT available when no field has exactly 1 remaining', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2
    state.roundPhase = 'work'
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed.push('D071_Changeover')

    // No field with remaining === 1
    player.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]

    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('D71-changeover-anytime')
  })
})
