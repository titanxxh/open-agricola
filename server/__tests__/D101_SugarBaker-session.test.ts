import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption } from '../../shared/contract/types'
import '../../shared/cards/D/D101_SugarBaker'

const CARD_ID = 'D101_SugarBaker'

const setup = (food: number) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationPlayed.push(CARD_ID)
  player.resources = {
    ...player.resources,
    food,
    grain: 1,
  }
  player.fields = [{ row: 0, col: 0, stacks: [] }]
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  const grainSpace = state.actionSpaces.find((space) => space.id === 'grain-utilization')
  expect(grainSpace).toBeDefined()
  if (grainSpace) grainSpace.resources.food = 0

  session.loadState(state)
  return session
}

const completeGrainUtilizationSow = (session: GameSession) => {
  let resp = session.takeAction(0, 'grain-utilization')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp

  if (resp.interaction.promptKey === 'ui.interactionGrainUtilizationChoice') {
    const sowOption = resp.interaction.options?.find((option) => option.value === 'sow')
    expect(sowOption).toBeDefined()
    resp = session.resolveChoice(0, sowOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return resp
  }

  expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')
  resp = session.commitSelectionChoice(0, {
    crops: [{ row: 0, col: 0, crop: 'grain' }],
  })
  expect(resp.ok).toBe(true)
  return resp
}

const d101AcceptOption = (options: ActionChoiceOption[] | undefined) =>
  options?.find(
    (option) => option.sourceCard === CARD_ID && option.value !== '__skip__' && !option.disabled,
  )

describe('D101_SugarBaker session', () => {
  it('skip after Grain Utilization sow leaves food, bonus VP, and space food unchanged', () => {
    const session = setup(1)
    const before = session.getState().state
    const foodBefore = before.players[0]!.resources.food
    const bonusBefore = before.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp
    const spaceFoodBefore = before.actionSpaces.find((space) => space.id === 'grain-utilization')!.resources.food

    let resp = completeGrainUtilizationSow(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(d101AcceptOption(resp.interaction.options)).toBeDefined()

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(bonusBefore)
    expect(resp.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.resources.food).toBe(spaceFoodBefore)
  })

  it('accept after Grain Utilization sow pays food, gains bonus VP, and returns food to the space', () => {
    const session = setup(1)
    const before = session.getState().state
    const foodBefore = before.players[0]!.resources.food
    const bonusBefore = before.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0
    const spaceFoodBefore = before.actionSpaces.find((space) => space.id === 'grain-utilization')!.resources.food

    let resp = completeGrainUtilizationSow(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = d101AcceptOption(resp.interaction.options)
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore - 1)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(bonusBefore + 1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.resources.food).toBe(spaceFoodBefore + 1)
  })

  it('does not offer an executable pay-gain branch when the player has no food', () => {
    const session = setup(0)

    const resp = completeGrainUtilizationSow(session)
    if (resp.interaction.stateId !== 'wait') return

    expect(d101AcceptOption(resp.interaction.options)).toBeUndefined()
  })
})
