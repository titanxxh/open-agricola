import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption } from '../../shared/contract/types'
import '../../shared/cards/A/A024_ThreshingBoard'

const CARD_ID = 'A024_ThreshingBoard'

const setup = () => {
  const session = new GameSession(6024, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 14
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

const finishPlow = (session: GameSession) => {
  const response = session.getState()
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected plow selection')
  expect(response.interaction.request.kind).toBe('farm-select')
  const tile = response.interaction.request.farm.selectableTiles[0]
  expect(tile).toBeDefined()
  const result = session.commitSelectionChoice(0, { tile })
  expect(result.ok).toBe(true)
  expect(result.state.players[0]!.fields).toHaveLength(1)
  return result
}

describe('A024_ThreshingBoard session', () => {
  it.each(['no-grain', 'no-cookery', 'other-space'])('does not offer baking for %s', (scenario) => {
    const session = setup()
    const state = session.getState().state
    if (scenario === 'no-grain') state.players[0]!.resources.grain = 0
    if (scenario === 'no-cookery') state.players[0]!.improvements = []
    session.loadState(state)
    const response = session.takeAction(0, scenario === 'other-space' ? 'forest' : 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    if (scenario !== 'other-space') finishPlow(session)
  })
  it.each(['farmland', 'cultivation'])('can decline baking before plowing at %s', (spaceId) => {
    const session = setup()

    let resp = session.takeAction(0, spaceId)
    expect(resp.state.players[0]!.fields).toHaveLength(0)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.map((option: ActionChoiceOption) => option.value)).toContain('__skip__')
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    finishPlow(session)
  })

  it.each(['farmland', 'cultivation'])('accepting baking at %s consumes grain before plowing', (spaceId) => {
    const session = setup()

    let resp = session.takeAction(0, spaceId)
    expect(resp.state.players[0]!.fields).toHaveLength(0)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.request.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)

    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      expect(resp.interaction.request.options?.map((option) => option.value)).not.toContain('cancel')
      resp = session.resolveChoice(0, 'Major_Fireplace1')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.fields).toHaveLength(0)
    finishPlow(session)
  })
})
