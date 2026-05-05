import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { confirmPlayerSwitch } from './_helpers/legacy-confirms'

import '../../shared/cards/D/D143_TreeCutter'

const CARD_ID = 'D143_TreeCutter'

describe('D143_TreeCutter session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  it('gains 1 wood when collecting 3+ clay from clay-pit', () => {
    const session = setup()
    const state = session.getState().state
    // Stack up clay-pit to have 3+ clay
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (!clayPit) throw new Error('clay-pit space missing')
    clayPit.resources.clay = 3
    session.loadState(state)

    const woodBefore = session.getState().state.players[0]!.resources.wood

    let resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // +3 clay from clay-pit, +1 wood from TreeCutter
    expect(after.players[0]!.resources.clay).toBeGreaterThanOrEqual(3)
    expect(after.players[0]!.resources.wood).toBe(woodBefore + 1)
  })

  it('does not trigger when collecting wood (excluded resource)', () => {
    const session = setup()
    const state = session.getState().state
    // Forest accumulates wood — excluded by TreeCutter
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (!forest) throw new Error('forest space missing')
    forest.resources.wood = 3
    session.loadState(state)

    const woodBefore = session.getState().state.players[0]!.resources.wood

    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Gained 3 wood from forest but NO extra 1 wood from TreeCutter (wood is excluded)
    expect(after.players[0]!.resources.wood).toBe(woodBefore + 3)
  })

  it('does not trigger when collecting less than 3 of any non-wood resource', () => {
    const session = setup()
    const state = session.getState().state
    // clay-pit with only 2 clay
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (!clayPit) throw new Error('clay-pit space missing')
    clayPit.resources.clay = 2
    session.loadState(state)

    const woodBefore = session.getState().state.players[0]!.resources.wood

    let resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // No bonus wood — only 2 clay collected
    expect(after.players[0]!.resources.wood).toBe(woodBefore)
  })

  it('triggers when collecting 3+ reed from reed-bank', () => {
    const session = setup()
    const state = session.getState().state
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!reedBank) throw new Error('reed-bank space missing')
    reedBank.resources.reed = 3
    session.loadState(state)

    const woodBefore = session.getState().state.players[0]!.resources.wood

    let resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.wood).toBe(woodBefore + 1)
  })
})
