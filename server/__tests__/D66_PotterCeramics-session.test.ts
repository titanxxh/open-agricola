import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B026_AgrarianFences'
import '../../shared/cards/D/D066_PotterCeramics'
import '../../shared/cards/__stubs__/STUB_BeforeBakeGainClay'

const CARD_ID = 'D066_PotterCeramics'

const setup = (overrides: {
  clay?: number
  grain?: number
  improvements?: string[]
  extraPlayedCards?: string[]
} = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    clay: overrides.clay ?? 1,
    grain: overrides.grain ?? 0,
    food: 0,
  }
  player.improvements = overrides.improvements ?? ['Major_Fireplace1']
  player.minorPlayed.push(CARD_ID, ...(overrides.extraPlayedCards ?? []))
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  session.loadState(state)
  return session
}

describe('D066_PotterCeramics session', () => {
  it('offers optional D66 before bake and uses it to make bake non-empty', () => {
    const session = setup()

    let resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)

    const d66 = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(d66).toBeDefined()
    resp = session.resolveChoice(0, d66!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      expect(resp.interaction.promptKey).toBe('ui.interactionBakeBreadChoice')
      expect(resp.interaction.request.options?.map((option) => option.value)).toContain('Major_Fireplace1')
      resp = session.resolveChoice(0, 'Major_Fireplace1')
    }
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('does not offer D66 when player has no bake source', () => {
    const session = setup({ improvements: [], clay: 1, grain: 0 })

    const resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionSelectTrigger') {
      expect(resp.interaction.request.options?.map((option) => option.value)).not.toContain(CARD_ID)
    }
  })

  it('can skip D66 after B26 replacement chooses bake plus fences when fencing can continue without it', () => {
    const session = setup({
      clay: 1,
      grain: 0,
      extraPlayedCards: ['B026_AgrarianFences'],
    })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 15
    player.fields = []
    session.loadState(state)

    let resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionGrainUtilizationChoice')
    const bakeReplacement = resp.interaction.request.options?.find((option) =>
      String(option.value).includes('bake-bread'),
    )
    expect(bakeReplacement).toBeDefined()

    resp = session.resolveChoice(0, bakeReplacement!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionFlowSelect')
    const bakeAndFence = resp.interaction.request.options?.find(
      (option) => option.labelKey === 'ui.interactionAgrarianFencesBakeAndFence',
    )
    expect(bakeAndFence).toBeDefined()

    resp = session.resolveChoice(0, bakeAndFence!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)

    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(1)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionFenceSelect')
  })
})
