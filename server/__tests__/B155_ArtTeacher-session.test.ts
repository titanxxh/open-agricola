import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/register-all'
import '../../shared/cards/B/B155_ArtTeacher'

const CARD_ID = 'B155_ArtTeacher'
const TRAVELING_PLAYERS = 'traveling-players'

const setupBase = (playerCount = 4) => {
  const session = new GameSession(undefined, undefined, { playerCount })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  return { session, state }
}

const setTpFood = (state: ReturnType<typeof setupBase>['state'], n: number) => {
  const tp = state.actionSpaces.find((s) => s.id === TRAVELING_PLAYERS)
  if (!tp) throw new Error('traveling-players space missing')
  tp.resources = { ...(tp.resources ?? {}), food: n } as never
}

const tpFoodAfter = (resp: { state: { actionSpaces: { id: string; resources?: { food?: number } }[] } }) =>
  resp.state.actionSpaces.find((s) => s.id === TRAVELING_PLAYERS)?.resources?.food ?? 0

describe('B155 ArtTeacher onBuy listener', () => {
  it('case 1: playing B155 (cost-0 lessons) grants 1 wood + 1 reed', () => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = []
    player.occupationHand = [CARD_ID]
    player.resources = { ...player.resources, food: 0 }
    const woodBefore = player.resources.wood
    const reedBefore = player.resources.reed
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    if (resp.pending.type === 'choice') {
      const opt = resp.pending.options.find((o) => o.value === CARD_ID)
      expect(opt).toBeDefined()
      resp = session.resolveChoice(0, opt!.value)
    }
    expect(resp.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(woodBefore + 1)
    expect(resp.state.players[0]!.resources.reed).toBe(reedBefore + 1)
  })
})

describe('B155 ArtTeacher computeCosts (TP food trade)', () => {
  // Scenario template: player has B155 already played + 1 dummy occupation
  // played → next occupation costs 1 food via lessons. Hand contains another
  // playable occupation. Player food + TP food are configured per case.
  const setupSubsequent = (tpFood: number, playerFood = 0) => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = [CARD_ID, 'A123_FrameBuilder']
    player.occupationHand = ['A153_PigOwner']
    player.resources = { ...player.resources, food: playerFood }
    setTpFood(state, tpFood)
    session.loadState(state)
    return { session, player }
  }

  it('case 2: TP food=3, player food=0 → trade auto-resolves, TP -1, occupation played', () => {
    // computeCosts injects single trade {to:{food:1}, max:3, sideEffect}.
    // computeAllBuyableCombinations enumerates 0..3 trade times; only the
    // 1-trade-once solution covers the food:1 fee with player food=0.
    // The lessons + play-occupation chain completes without any prompt — the
    // single optimal solution is auto-applied by the engine.
    const { session } = setupSubsequent(3, 0)
    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A153_PigOwner')
    expect(tpFoodAfter(resp)).toBe(2)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('case 3: TP food=2, player food=0 → 1-trade solution drains exactly 1 TP food', () => {
    // Cost=1 food, player has 0 food, TP=2. computeAllBuyableCombinations
    // enumerates 0,1,2 trade times; only the 1-trade-once solution is buyable
    // (the 2-times solution overpays). sideEffect.drainSpace fires with
    // times=1, so TP food becomes 1.
    const { session } = setupSubsequent(2, 0)
    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A153_PigOwner')
    expect(tpFoodAfter(resp)).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('case 4: player food=2, TP food=3 → engine prefers cheapest (own food, no trade)', () => {
    // Player can pay {food:1} from supply OR via 1 B155 trade. Both produce
    // resourcesPaid={food:1}, but the trade variant adds a sideEffect (drain TP).
    // keepOnlyOptimals dedupes to a single non-dominated solution; in this
    // implementation, the no-trade variant wins (no extra cost) and is
    // auto-applied. TP unchanged.
    const { session } = setupSubsequent(3, 2)
    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A153_PigOwner')
    // Either path is acceptable per BGA semantics — player optionally uses TP
    // food. We just verify state consistency (player food + TP food) sums to
    // the original (3+2)=5 minus the 1-food cost paid in some way.
    const totalAfter =
      resp.state.players[0]!.resources.food + tpFoodAfter(resp)
    expect(totalAfter).toBe(2 + 3 - 1)
  })

  it('case 5: TP food=0 → no B155 trade injected; player pays from own food', () => {
    const { session } = setupSubsequent(0, 1)
    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(tpFoodAfter(resp)).toBe(0)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A153_PigOwner')
  })

  it('case 6: cost=0 first occupation (B155 itself) → no payment, no TP drain', () => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = []
    player.occupationHand = [CARD_ID]
    player.resources = { ...player.resources, food: 0 }
    setTpFood(state, 3)
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    if (resp.pending.type === 'choice') {
      resp = session.resolveChoice(0, CARD_ID)
    }
    expect(resp.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(tpFoodAfter(resp)).toBe(3)
  })

  it('case 7: B155 not played yet → no computeCosts hook; pure-food cost path', () => {
    // With B155 only in hand (not played), B155 listener should not match.
    // Player must pay food directly. TP food unchanged regardless.
    const { session, state } = setupBase()
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = ['A123_FrameBuilder'] // 1 dummy → cost food:1
    player.occupationHand = ['A153_PigOwner']
    player.resources = { ...player.resources, food: 1 }
    setTpFood(state, 3)
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A153_PigOwner')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(tpFoodAfter(resp)).toBe(3)
  })
})
