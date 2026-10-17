import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { GameEvent } from '../../shared/contract/events'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/register-all'
import '../../shared/cards/B/B155_ArtTeacher'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit30Native from './_helpers/audit/ae-negative-30-native'

const CARD_ID = 'B155_ArtTeacher'
const TRAVELING_PLAYERS = 'traveling-players'
const TP_PAYMENT_RESOURCE = 'B155_ArtTeacher:traveling-players-food'
type ResourcePaidEvent = Extract<GameEvent, { type: 'resource.paid' }>

const setupBase = (playerCount = 4) => {
  const session = new GameSession(undefined, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
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
    let safety = 8
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.request.kind === 'select-trigger') {
        resp = resolveTriggerIfPresent(session, resp, CARD_ID)
        continue
      }
      if (resp.interaction.request.kind !== 'choice') break
      const matched = resp.interaction.request.options?.find((o) => o.value === CARD_ID)
      const next = matched?.value
        ?? resp.interaction.request.options?.find((o) => o.value !== '__skip__')?.value
      if (!next) break
      resp = session.resolveChoice(0, next)
    }
    expect(resp.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(woodBefore + 1)
    expect(resp.state.players[0]!.resources.reed).toBe(reedBefore + 1)
  })
})

describe('B155 ArtTeacher computeCosts (TP food payment resource)', () => {
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

  it('case 2: TP food=3, player food=0 → TP payment auto-resolves, TP -1, occupation played', () => {
    // computeCosts injects a Traveling Players-backed payment resource.
    // computeAllBuyableCombinations enumerates provider usage; only the
    // 1-TP-food solution covers the food:1 fee with player food=0.
    // The lessons + occupation chain completes without any prompt — the
    // single optimal solution is auto-applied by the engine.
    const { session } = setupSubsequent(3, 0)
    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A153_PigOwner')
    expect(tpFoodAfter(resp)).toBe(2)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('case 3: TP food=2, player food=0 → TP payment drains exactly 1 TP food', () => {
    // Cost=1 food, player has 0 food, TP=2. Only using 1 TP food is buyable
    // (using 2 overpays). The provider consume path drains exactly 1 TP food.
    const { session } = setupSubsequent(2, 0)
    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A153_PigOwner')
    expect(tpFoodAfter(resp)).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('case 4: player food=2, TP food=3 → direct and TP-food payments are distinct choices', () => {
    const { session } = setupSubsequent(3, 2)
    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    const paidOptions = resp.interaction.request.options?.map((option) =>
      option.labelParams?.resourcesPaid as Record<string, number> | undefined,
    ) ?? []
    expect(paidOptions.some((paid) => (paid?.food ?? 0) === 1)).toBe(true)
    expect(paidOptions.some((paid) => (paid?.[TP_PAYMENT_RESOURCE] ?? 0) === 1)).toBe(true)
    const tpPaymentOption = resp.interaction.request.options?.find((option) =>
      ((option.labelParams?.resourcesPaid as Record<string, number> | undefined)?.[TP_PAYMENT_RESOURCE] ?? 0) === 1,
    )
    expect(tpPaymentOption?.labelParams?.sourceCards).toEqual([CARD_ID])
    expect(tpPaymentOption?.effectPreview).toMatchObject({ sourceCards: [CARD_ID] })
  })

  it('case 4a: selecting TP-food payment drains TP food and preserves player food', () => {
    const { session } = setupSubsequent(3, 2)
    const wait = session.takeAction(0, 'lessons')
    expect(wait.ok).toBe(true)
    expect(wait.interaction.stateId).toBe('wait')
    const option = wait.interaction.request.options?.find((entry) =>
      ((entry.labelParams?.resourcesPaid as Record<string, number> | undefined)?.[TP_PAYMENT_RESOURCE] ?? 0) === 1,
    )
    expect(option).toBeDefined()

    const resp = session.resolveChoice(0, option!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A153_PigOwner')
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(tpFoodAfter(resp)).toBe(2)
    const paidEvent = resp.state.events.find((event): event is ResourcePaidEvent =>
      event.type === 'resource.paid' &&
      (event.resources[TP_PAYMENT_RESOURCE] ?? 0) === 1,
    )
    expect(paidEvent).toBeDefined()
    expect(paidEvent?.paymentSources).toEqual([
      { from: { kind: 'actionSpace', spaceId: TRAVELING_PLAYERS }, resources: { food: 1 } },
    ])
  })

  it('case 4b: selecting own-food payment preserves TP food and spends player food', () => {
    const { session } = setupSubsequent(3, 2)
    const wait = session.takeAction(0, 'lessons')
    expect(wait.ok).toBe(true)
    expect(wait.interaction.stateId).toBe('wait')
    const option = wait.interaction.request.options?.find((entry) =>
      ((entry.labelParams?.resourcesPaid as Record<string, number> | undefined)?.food ?? 0) === 1,
    )
    expect(option).toBeDefined()

    const resp = session.resolveChoice(0, option!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A153_PigOwner')
    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(tpFoodAfter(resp)).toBe(3)
  })

  it('case 5: TP food=0 → no B155 provider injected; player pays from own food', () => {
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
    if (resp.interaction.stateId === 'wait') {
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

describe('ae-negative-30-native', () => {
  const { sessions, commands, save, make, take, finish, play, undo, pile, res } = audit30Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); commands.splice(0); });
  it('B155 N1 real first purchase gains wood and reed without draining Traveling Players', () => { const s = make('B155_ArtTeacher', st => pile(st, 'traveling-players', 'food', 3), false), r = finish(s, play(s, 'B155_ArtTeacher')), u = undo(s); res(r, { wood: 1, reed: 1, food: 100 }); assert.equal(r.state.actionSpaces.find(x => x.id === 'traveling-players')!.resources.food, 3); res(u, { wood: 0, reed: 0 }); save('B155-N1', { r, u }); });
  it('B155 N2 later occupation fees can use Traveling Players or personal food by actual selection', () => { for (const mode of ['onlyTP', 'TP', 'own']) {
      const s = make('B155_ArtTeacher', st => { st.players[0]!.resources.food = mode === 'onlyTP' ? 0 : 2; pile(st, 'traveling-players', 'food', 3); });
      const p = take(s, 0, 'lessons');
      const r = finish(s, p, true, [mode === 'own' ? '"food":1' : '"B155_ArtTeacher:traveling-players-food":1', 'A125_Priest']);
      res(r, { food: mode === 'onlyTP' ? 0 : mode === 'own' ? 1 : 2 });
      assert.equal(r.state.actionSpaces.find(x => x.id === 'traveling-players')!.resources.food, mode === 'own' ? 3 : 2);
      assert.ok(r.state.players[0]!.occupationPlayed.includes('A125_Priest'));
      save(`B155-N2-${mode}`, { p, r });
  } });
  it('B155 N3 empty pile held card and foreign actor cannot supply a card payment', () => { for (const mode of ['empty', 'none', 'hand', 'opponent']) {
      const a = mode === 'opponent' ? 1 : 0, s = make('B155_ArtTeacher', st => { pile(st, 'traveling-players', 'food', mode === 'empty' || mode === 'none' ? 0 : 3); st.players[a]!.resources.food = mode === 'none' ? 0 : 1; if (mode === 'hand')
          st.players[0]!.occupationPlayed = ['A110_Roughcaster']; if (mode === 'opponent') {
          st.currentPlayerIndex = 1;
          st.players[1]!.occupationPlayed = ['A110_Roughcaster'];
          st.players[1]!.occupationHand = ['A123_FrameBuilder', 'A133_Braggart'];
      } }, mode !== 'hand');
      if (mode === 'none') {
          const r = assertRejectedUnchanged(s, () => s.takeAction(0, 'lessons'));
          save(`B155-N3-${mode}`, r);
      }
      else {
          const r = finish(s, take(s, a, 'lessons'), true, ['A125_Priest', 'A123_FrameBuilder']);
          res(r, { food: 0 }, a);
          assert.equal(r.state.actionSpaces.find(x => x.id === 'traveling-players')!.resources.food, mode === 'empty' ? 0 : 3);
          save(`B155-N3-${mode}`, r);
      }
  } });
})
