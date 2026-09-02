import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/D/D070_StrawManure'
import '../../shared/cards/B/B068_Beanfield'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'

const CARD_ID = 'D070_StrawManure'

describe('D070_StrawManure session', () => {
  const setupHarvest = (includeCardField = false) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push('D070_StrawManure')
    player.resources.grain = 3

    // Two vegetable fields with crops + one grain field
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
    ]
    if (includeCardField) {
      player.minorPlayed.push('B068_Beanfield')
      player.cardStates.B068_Beanfield = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] },
      }
    }

    session.loadState(state)
    return { session, player: state.players[0]! }
  }

  it('pays 1 grain and adds 1 vegetable to up to 2 selected vegetable fields', () => {
    const { session } = setupHarvest()

    let resp = session.performRoundEnd()
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    resp = resolveNonSkipChoice(session, resp)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')

    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 0 }, { row: 0, col: 1 }] })
    expect(resp.ok).toBe(true)

    autoAdvanceRoundEnd(session)

    const p = session.getState().state.players[0]!
    // Initial grain=3, paid 1, harvested 1 from grain field: 3 - 1 + 1 = 3
    expect(p.resources.grain).toBe(3)

    // After card effect: field 0-0 remaining 2→3, then normal harvest reaps 1 → 2
    const f0 = p.fields.find(f => f.row === 0 && f.col === 0)!
    expect(f0.stacks[0]?.remaining ?? 0).toBe(2)

    // After card effect: field 0-1 remaining 1→2, then normal harvest reaps 1 → 1
    const f1 = p.fields.find(f => f.row === 0 && f.col === 1)!
    expect(f1.stacks[0]?.remaining ?? 0).toBe(1)

    // Player gained vegetables from harvest: 2 (normal) from 2 veg fields
    expect(p.resources.vegetable).toBeGreaterThanOrEqual(2)

    // Grain field: was 3, harvested 1 → remaining 2
    const f2 = p.fields.find(f => f.row === 0 && f.col === 2)!
    expect(f2.stacks[0]?.remaining ?? 0).toBe(2)
  })

  it('player can decline the optional effect', () => {
    const { session } = setupHarvest()

    let resp = session.performRoundEnd()
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    resp = resolveSkipChoice(session, resp)

    autoAdvanceRoundEnd(session)

    const p = session.getState().state.players[0]!
    // Grain not spent: initial 3 + 1 from harvest = 4
    expect(p.resources.grain).toBe(4)
  })

  it('adds and then reaps a vegetable on a selected Card Field', () => {
    const { session } = setupHarvest(true)

    let resp = session.performRoundEnd()
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    resp = resolveNonSkipChoice(session, resp)
    resp = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 2068 }] })
    expect(resp.ok).toBe(true)

    autoAdvanceRoundEnd(session)

    expect(session.getState().state.players[0]!.cardStates.B068_Beanfield?.extraData?.cardFieldStacks)
      .toEqual([{ crop: 'vegetable', remaining: 2 }])
  })

  it('does not trigger when player has no grain', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push('D070_StrawManure')
    player.resources.grain = 0
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()
    // No optional choice since grain = 0
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.promptKey).not.toBe('ui.interactionOptionalAction')
    }
  })

  it('does not trigger when no vegetable fields have crops', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push('D070_StrawManure')
    player.resources.grain = 3
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()
    // No choice for Straw Manure since no vegetable fields
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.promptKey).not.toBe('ui.interactionOptionalAction')
    }
  })
})
