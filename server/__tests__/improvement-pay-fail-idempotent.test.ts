import { describe, it, expect } from 'vitest'
import { GameSession } from '../game/authoritative-session'

const setWorkersAtHome = (state: any, player: any, count: number) => {
  player.workers = Array.from({ length: 5 }, (_, i) => ({
    id: String(i + 1),
    isActive: i < count,
    isNewborn: false,
  }))
}

describe('improvement: pay fail idempotent', () => {
  it('cannot afford major-improvement -> pending stays choice; player.improvements untouched', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    setWorkersAtHome(state, state.players[1]!, 0)
    // Zero out resources so Major_Fireplace1 (2 clay or 3 food) cannot be paid.
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0,
    }
    if (!state.availableMajorImprovements.includes('Major_Fireplace1')) {
      state.availableMajorImprovements.push('Major_Fireplace1')
    }
    session.loadState(state)
    // Drop minor hand AFTER loadState (loadState's normalizeState re-deals
    // empty minorHand from the seed). Mutating the live state directly
    // bypasses that.
    session.getState().state.players[0]!.minorHand = []
    session.getState().state.players[0]!.minorPlayed = []
    session.getState().state.players[0]!.occupationHand = []
    // Also zero opponent's hand so minor-improvement-card listeners that
    // scope = 'any' / 'opponent' don't surprise us.
    session.getState().state.players[1]!.minorHand = []
    session.getState().state.players[1]!.minorPlayed = []
    const before = session.getState().state.players[0]!
    const beforeImprovements = [...before.improvements]
    const beforeMinorPlayed = [...before.minorPlayed]
    const beforeStats = before.stats?.totalMajorBuilt ?? 0
    const beforeAvail = [...session.getState().state.availableMajorImprovements]

    const resp = session.takeAction(0, 'major-improvement')
    // No options affordable -> action should fail without mutating state.
    // (Either resp.ok=false / fail errorKey, or pending=choice with no Fireplace1 option.)
    const after = resp.state.players[0]!
    expect(after.improvements).toEqual(beforeImprovements)
    expect(after.minorPlayed).toEqual(beforeMinorPlayed)
    expect(after.stats?.totalMajorBuilt ?? 0).toBe(beforeStats)
    expect(resp.state.availableMajorImprovements).toEqual(beforeAvail)
  })

  it('mid-flow pay-fail keeps improvement finalizer uncommitted', () => {
    const session = new GameSession(1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    setWorkersAtHome(state, state.players[1]!, 0)
    player.resources = { ...player.resources, wood: 2, clay: 2, stone: 2, food: 0 }
    player.minorHand = ['B065_GrainDepot']
    player.occupationHand = ['__test_placeholder__']
    state.availableMajorImprovements = []
    session.loadState(state)
    const liveState = session.getState().state
    liveState.availableMajorImprovements = []
    liveState.players[0]!.resources = {
      ...liveState.players[0]!.resources,
      wood: 2,
      clay: 2,
      stone: 2,
      food: 0,
    }
    liveState.players[0]!.minorHand = ['B065_GrainDepot']
    liveState.players[0]!.occupationHand = ['__test_placeholder__']
    liveState.players[1]!.minorHand = ['__test_placeholder__']
    liveState.players[1]!.occupationHand = ['__test_placeholder__']
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.interaction.promptKey !== 'prompt.selectPayment') {
      const opt = resp.interaction.options?.find((o) => o.value === 'B065_GrainDepot')
      expect(opt).toBeDefined()
      resp = session.resolveChoice(0, opt!.value)
    }
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')

    const payOption = resp.interaction.options?.find((o) => o.value === 'pay:improvement:minor:B065_GrainDepot:1')
    expect(payOption).toBeDefined()
    liveState.players[0]!.resources = {
      ...liveState.players[0]!.resources,
      wood: 0,
      stone: 0,
      food: 0,
      clay: 0,
    }

    resp = session.resolveChoice(0, payOption!.value)

    expect(resp.ok).toBe(false)
    expect(resp.state.players[0]!.minorHand).toContain('B065_GrainDepot')
    expect(resp.state.players[0]!.minorPlayed).not.toContain('B065_GrainDepot')
    expect(resp.state.players[0]!.stats?.totalMinorBuilt ?? 0).toBe(0)
    expect(resp.state.futureMeeples.some((entry) => entry.cardId === 'B065_GrainDepot')).toBe(false)
  })
})
