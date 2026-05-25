import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption } from '../../shared/contract/types'
import '../../shared/cards/A/A24_ThreshingBoard'

const CARD_ID = 'A24_ThreshingBoard'

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed.push(CARD_ID)
  player.improvements.push('Major_Fireplace1')
  player.resources = { ...player.resources, grain: 1, food: 0 }
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  session.loadState(state)
  return session
}

const completeFarmland = (session: GameSession) => {
  let resp = session.takeAction(0, 'farmland')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected farmland tile selection')
  const tile = resp.interaction.farm.selectableTiles[0]
  expect(tile).toBeDefined()
  resp = session.commitSelectionChoice(0, { tile })
  expect(resp.ok).toBe(true)
  return resp
}

describe('A24_ThreshingBoard session', () => {
  it('can skip the optional bake after farmland', () => {
    const session = setup()

    let resp = completeFarmland(session)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.map((option: ActionChoiceOption) => option.value)).toContain('__skip__')
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('accepting the optional bake must bake at least one grain', () => {
    const session = setup()

    let resp = completeFarmland(session)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)

    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      expect(resp.interaction.options?.map((option) => option.value)).not.toContain('cancel')
      resp = session.resolveChoice(0, 'Major_Fireplace1')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
  })
})
