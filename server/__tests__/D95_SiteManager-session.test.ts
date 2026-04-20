import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { D95_SiteManager } from '../../shared/cards/D/D95_SiteManager'
import { occupations } from '../../shared/game/occupations'

import { setWorkersAtHome } from '../../shared/game/player'
const CARD_ID = 'D95_SiteManager'

// Catalog registration is handled by the parent agent; for local testing we
// splice the card into the occupation registry if absent.
if (!occupations.some((c) => c.id === CARD_ID)) {
  occupations.push(D95_SiteManager)
}

describe('D95_SiteManager session', () => {
  // Deterministic setup: fixed seed + explicit non-card placeholder hands so the
  // dealt-hand randomness from `new GameSession()` never leaks into the test.
  // See the equivalent comment in `worker-identity-fg.test.ts` for the rationale.
  const FILLER = '__test_filler__'

  const setup = () => {
    const session = new GameSession(/* seed */ 1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    for (const p of state.players) {
      p.minorHand = [FILLER]
      p.occupationHand = [FILLER]
    }

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID, 'A85_Homekeeper']
    // Give 5 clay so Fireplace is affordable (2 clay cost) even without substitution
    player.resources = { ...player.resources, food: 10, wood: 0, clay: 5, stone: 0, reed: 0 }

    if (!state.availableMajorImprovements.includes('Major_Fireplace1')) {
      state.availableMajorImprovements.push('Major_Fireplace1')
    }
    session.loadState(state)
    return session
  }

  const playOccupation = (session: GameSession) => {
    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return resp
    const opt = resp.pending.options?.find((o) => o.value === CARD_ID)
    expect(opt).toBeDefined()
    return session.resolveChoice(0, opt!.value)
  }

  it('offers an optional major improvement purchase after playing', () => {
    const session = setup()
    let resp = playOccupation(session)
    expect(resp.state.players[0]!.occupationPlayed).toContain(CARD_ID)

    // The optional improvement is wrapped in an outer xor/optional, so the
    // first choice is "take flow" vs "skip". Drill into the inner improvement
    // choice and assert we see Fireplace1 as a major option.
    let steps = 0
    let foundFireplace = false
    while (resp.pending.type === 'choice' && steps < 10) {
      steps++
      const options = resp.pending.options ?? []
      if (options.some((o) => o.value === 'major:Major_Fireplace1')) {
        foundFireplace = true
        break
      }
      const nonSkip = options.find(
        (o) => o.value !== '__skip__' && o.value !== 'cancel',
      )
      if (nonSkip) {
        resp = session.resolveChoice(0, nonSkip.value)
      } else {
        break
      }
    }
    expect(foundFireplace).toBe(true)
  })

  it('substitutes food for lacking building resource via computeCosts', () => {
    const session = new GameSession(/* seed */ 1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    for (const p of state.players) {
      p.minorHand = [FILLER]
      p.occupationHand = [FILLER]
    }
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID, 'A85_Homekeeper']
    // 1 clay (lacking 1) + plenty of food. Greedy substitution will replace the
    // second clay unit with 1 food.
    player.resources = { ...player.resources, food: 10, clay: 1, wood: 0, stone: 0, reed: 0 }
    if (!state.availableMajorImprovements.includes('Major_Fireplace1')) {
      state.availableMajorImprovements.push('Major_Fireplace1')
    }
    session.loadState(state)
    let resp = playOccupation(session)

    // Walk until we find and pick Fireplace1
    let steps = 0
    let bought = false
    while (resp.pending.type === 'choice' && steps < 12) {
      steps++
      const options = resp.pending.options ?? []
      const fireplace = options.find(
        (o) => o.value === 'major:Major_Fireplace1' || o.value === 'Major_Fireplace1',
      )
      if (fireplace && !bought) {
        resp = session.resolveChoice(0, fireplace.value)
        bought = true
        continue
      }
      const next = options.find(
        (o) => o.value !== '__skip__' && o.value !== 'cancel',
      )
      if (next) {
        resp = session.resolveChoice(0, next.value)
      } else {
        break
      }
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Fireplace1')
    // Base cost 2 clay. Player had 1 clay → substituted 1 clay with 1 food.
    expect(after.resources.clay).toBe(0)
    expect(after.resources.food).toBe(9) // 10 - 1 food substitution
  })

  it('does not substitute when player has all needed resources', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.clay = 5
    player.resources.food = 10
    session.loadState(state)

    let resp = playOccupation(session)
    // Player has enough clay for Fireplace (2) → no food substitution.
    let steps = 0
    let bought = false
    while (resp.pending.type === 'choice' && steps < 12) {
      steps++
      const options = resp.pending.options ?? []
      const fireplace = options.find(
        (o) => o.value === 'major:Major_Fireplace1' || o.value === 'Major_Fireplace1',
      )
      if (fireplace && !bought) {
        resp = session.resolveChoice(0, fireplace.value)
        bought = true
        continue
      }
      const next = options.find(
        (o) => o.value !== '__skip__' && o.value !== 'cancel',
      )
      if (next) {
        resp = session.resolveChoice(0, next.value)
      } else {
        break
      }
    }

    const p = resp.state.players[0]!
    expect(p.improvements).toContain('Major_Fireplace1')
    // Full clay cost paid; food untouched.
    expect(p.resources.food).toBe(10)
    expect(p.resources.clay).toBe(3) // 5 - 2
  })
})
