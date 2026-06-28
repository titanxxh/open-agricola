import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/B/B019_MoldboardPlow'

const setupB19 = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed.push('B019_MoldboardPlow')
  player.cardStates.B019_MoldboardPlow = { stack: ['field', 'field'] }
  session.loadState(state)
  return session
}

const takeFarmlandAndPlowBaseField = (session: GameSession) => {
  let resp = session.takeAction(0, 'farmland')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : null)
    .toBe('farm-select')
  expect(resp.interaction.stateId === 'wait'
    ? resp.interaction.options?.map((option) => option.value)
    : [],
  ).toEqual(['confirm'])

  resp = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
  expect(resp.ok).toBe(true)
  return resp
}

describe('action cancel BGA parity session regressions', () => {
  it('B19 optional plow can be skipped through parent __skip__ without popping stack', () => {
    const session = setupB19()
    const resp = takeFarmlandAndPlowBaseField(session)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.options?.map((option) => option.value)).toContain('__skip__')

    const skipped = session.resolveChoice(0, '__skip__')
    expect(skipped.ok).toBe(true)
    expect(skipped.state.players[0]!.fields).toEqual([{ row: 0, col: 0, stacks: [] }])
    expect(skipped.state.players[0]!.cardStates.B019_MoldboardPlow?.stack)
      .toEqual(['field', 'field'])
  })

  it('B19 accepted optional plow exposes only confirm and rejects direct cancel', () => {
    const session = setupB19()
    const resp = takeFarmlandAndPlowBaseField(session)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected optional prompt')
    const accept = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    const accepted = session.resolveChoice(0, accept!.value)
    expect(accepted.ok).toBe(true)
    expect(accepted.interaction.stateId === 'wait' ? accepted.interaction.request.kind : null)
      .toBe('farm-select')
    expect(accepted.interaction.stateId === 'wait'
      ? accepted.interaction.options?.map((option) => option.value)
      : [],
    ).toEqual(['confirm'])

    const rejected = session.commitSelectionChoice(0, { cancel: true })
    expect(rejected.ok).toBe(false)
    expect(rejected.ok ? '' : rejected.error).toBe('action cancel is not allowed')
    expect(rejected.interaction.stateId === 'wait' ? rejected.interaction.request.kind : null)
      .toBe('farm-select')
    expect(rejected.state.players[0]!.cardStates.B019_MoldboardPlow?.stack)
      .toEqual(['field', 'field'])

    const completed = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
    expect(completed.ok).toBe(true)
    expect(completed.state.players[0]!.fields).toEqual([
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
    ])
    expect(completed.state.players[0]!.cardStates.B019_MoldboardPlow?.stack).toEqual(['field'])
  })
})
