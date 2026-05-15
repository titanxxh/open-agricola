import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption } from '../../shared/contract/types'
import '../../shared/cards/C/C25_SteamMachine'

const CARD_ID = 'C25_SteamMachine'

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 1)
  player.minorPlayed.push(CARD_ID)
  player.improvements.push('Major_Fireplace1')
  player.resources = { ...player.resources, grain: 1, food: 0 }
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  const forest = state.actionSpaces.find((space) => space.id === 'forest')
  if (forest) forest.resources.wood = 1

  session.loadState(state)
  return session
}

const takeForest = (session: GameSession) => {
  const resp = session.takeAction(0, 'forest')
  expect(resp.ok).toBe(true)
  return resp
}

describe('C25_SteamMachine session', () => {
  it('can skip the optional bake after the last worker uses an accumulation space', () => {
    const session = setup()

    let resp = takeForest(session)

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

    let resp = takeForest(session)

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
