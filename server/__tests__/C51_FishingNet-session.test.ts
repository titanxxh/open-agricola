import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import type { ActionDetailParts } from '../../shared/contract/protocol/game'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/C/C051_FishingNet'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, confirmNext } from './_helpers/negative-rule-audit'
import * as audit37Food from './_helpers/audit/ae-negative-37-food'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe('C051_FishingNet session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = createWorkSession({ seed: 42, configure: state => {
      state.currentPlayerIndex = currentPlayerIndex
      state.players[0]!.minorPlayed = ['C051_FishingNet']
      state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2
    } })
    sessions.push(session)
    return session
  }

  it('card owner gains 1 food when opponent uses fishing', () => {
    const session = setup(1)
    const s = session.getState().state
    const ownerFoodBefore = s.players[0]!.resources.food

    // Opponent (p1) uses fishing
    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)

    // Walk through any pending states
    let safety = 20
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch' || resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-next-player') {
      if (--safety <= 0) break
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
      } else {
        resp = confirmNextPlayer(session)
      }
    }

    const after = session.getState().state
    // Card owner should have gained 1 food
    expect(after.players[0]!.resources.food).toBe(ownerFoodBefore + 1)
  })

  it('records a pending deposit and an independent activation episode after opponent uses fishing', () => {
    const session = setup(1)

    // Opponent (p1) uses fishing
    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)

    // Walk through pending player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.cardStates.C051_FishingNet?.extraData).toMatchObject({ pendingDeposits: 1, depositEpisode: 1 })
  })

  it('2 food placed on fishing space during return-home phase', () => {
    const session = setup(1)
    const state = session.getState().state
    state.round = 1
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.minorPlayed = ['C051_FishingNet']

    // Each player has 1 worker
    state.players.forEach((p) => {
      setActiveWorkerCount(p, 1)
      setWorkersAtHome(state, p, 1)
      p.resources.food = 10
    })

    // Fishing space has 2 accumulated food
    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')!
    fishingSpace.resources.food = 2

    session.loadState(state)

    // Opponent (p1) uses fishing — collects 2 food, card triggers: owner gains 1 food and a pending deposit
    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)

    // Walk through all pending states until stable
    let safety = 20
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch' || resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-next-player') {
      if (--safety <= 0) break
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
      } else {
        resp = confirmNextPlayer(session)
      }
    }

    // Owner uses day-laborer
    resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    // Walk through all pending states (round end should happen automatically)
    safety = 20
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch' || resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-next-player') {
      if (--safety <= 0) break
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
      } else {
        resp = confirmNextPlayer(session)
      }
    }

    const after = session.getState().state
    const afterFishing = after.actionSpaces.find((s) => s.id === 'fishing')!
    // Fishing space: was 2, opponent collected it (→ 0), onReturnHome adds +2 (→ 2),
    // round growth adds +1 for new round (→ 3)
    expect(afterFishing.resources.food).toBe(3)
    expect(after.round).toBe(2)
    expect(after.players[0]!.cardStates.C051_FishingNet?.extraData).toMatchObject({ pendingDeposits: 0, depositEpisode: 1 })
    expect(after.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === 'C051_FishingNet'
      && event.to.kind === 'actionSpace' && event.to.spaceId === 'fishing' && event.resources.food === 2)).toHaveLength(1)
  })

  it('no trigger when owner uses fishing themselves', () => {
    const session = setup(0)
    const s = session.getState().state
    const ownerFoodBefore = s.players[0]!.resources.food
    const fishingSpace = s.actionSpaces.find((sp) => sp.id === 'fishing')!
    const fishingFoodBefore = fishingSpace.resources.food

    // Owner (p0) uses fishing — opponent scope should NOT trigger
    let resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)

    // Walk through any pending player switches (there should be none for this card)
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Owner gains food from the fishing space itself (accumulated 2 food)
    // But should NOT gain the extra 1 food from FishingNet (opponent scope only)
    expect(after.players[0]!.resources.food).toBe(ownerFoodBefore + fishingFoodBefore)
    expect(after.players[0]!.cardStates.C051_FishingNet?.extraData?.pendingDeposits ?? 0).toBe(0)
    expect(after.players[0]!.cardStates.C051_FishingNet?.extraData?.depositEpisode ?? 0).toBe(0)
  })

  it('opponent food is deducted by 1 when they use fishing (payerId fix)', () => {
    const session = setup(1)
    const s = session.getState().state
    s.players[1]!.resources.food = 1
    session.loadState(s)
    const opponentFoodBefore = session.getState().state.players[1]!.resources.food

    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)

    let safety = 20
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch' || resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-next-player') {
      if (--safety <= 0) break
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
      } else {
        resp = confirmNextPlayer(session)
      }
    }

    const after = session.getState().state
    // Opponent gains 2 from fishing accumulation but pays 1 to FishingNet owner via payerId.
    // Net: +2 - 1 = +1
    expect(after.players[1]!.resources.food).toBe(opponentFoodBefore + 2 - 1)
    const actionDetail = after.log.find((entry) =>
      entry.key === 'log.actionDetail'
      && entry.params?.player === after.players[1]!.name
      && entry.params?.action === 'actions.fishing.name',
    )
    expect(actionDetail).toBeDefined()
    const detailParts = actionDetail?.params?.detailParts as ActionDetailParts | undefined
    expect(detailParts?.gains?.food).toBe(2)
    expect(detailParts?.costs?.food).toBe(1)
  })

  it('opponent without food cannot use fishing while owner has C51 (reference transferOrLose)', () => {
    const session = setup(1)
    const s = session.getState().state
    // Opponent has 0 food — by the reference rule, they cannot use Fishing.
    s.players[1]!.resources.food = 0
    session.loadState(s)

    const resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(false)
    // Fishing space should still hold its accumulated food (untouched).
    const after = session.getState().state
    const fishingAfter = after.actionSpaces.find((sp) => sp.id === 'fishing')!
    expect(fishingAfter.resources.food).toBe(2)
    // Owner did not gain anything either.
    expect(after.players[0]!.cardStates.C051_FishingNet?.extraData?.pendingDeposits ?? 0).toBe(0)
  })

  it('owner with 0 food can still use fishing themselves (own card does not block)', () => {
    const session = setup(0)
    const s = session.getState().state
    s.players[0]!.resources.food = 0
    session.loadState(s)

    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
  })

  it('no extra food on fishing space without an activated deposit during return-home', () => {
    const session = setup(0)
    const state = session.getState().state
    state.round = 1

    const owner = state.players[0]!
    owner.minorPlayed = ['C051_FishingNet']

    // All workers used, ready for round end
    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 2)
      p.resources.food = 10
    })

    // fishing space food before round end
    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')!
    fishingSpace.resources.food = 0

    session.loadState(state)
    const resp = session.performRoundEnd()

    // After round end, fishing space should have accumulated food for next round but no extra from card
    const afterFishing = resp.state.actionSpaces.find((s) => s.id === 'fishing')!
    // Fishing accumulates 1 food per round. Round 1 → round 2 start adds 1 food.
    // No extra 2 food because no deposit was activated.
    expect(afterFishing.resources.food).toBe(1)
  })
})

describe('ae-negative-37-food', () => {
  const { sessions, save, setup, finish, take, move, prerequisites, hand, buy, printed, denyMinor } = audit37Food
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C051 N1 actual printed purchase pays exact cost and excludes unavailable resources', () => { const card = 'C051_FishingNet', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "reed": 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 1); assert.equal(r.state.players[0]!.resources.reed, 0); save('C051-N1-legal', r); const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "reed": 0 }); }); denyMinor(t, card); save('C051-N1-short', t.getState()); });
  it('C051 N2 opponent prepays one food and each natural return home deposits exactly two on Fishing', () => {
      const card = 'C051_FishingNet', s = setup(card, 5, st => { st.players[1]!.resources.food = 1; st.actionSpaces.find(a => a.id === 'fishing')!.resources.food = 3; });
      for (const round of [5, 6]) {
          move(s, 'grain-seeds');
          let r = move(s, 'fishing');
          assert.equal(r.state.players[0]!.resources.food, round === 5 ? 41 : 42);
          assert.equal(r.state.players[1]!.resources.food, round === 5 ? 3 : 5);
          assert.equal(r.state.actionSpaces.find(a => a.id === 'fishing')!.resources.food, 0);
          save(`C051-N2-transfer-${round}`, r);
          move(s, 'clay-pit');
          move(s, 'reed-bank');
          r = finish(s, confirmNext(s, s.getState()));
          assert.equal(r.state.round, round + 1);
          assert.equal(r.state.actionSpaces.find(a => a.id === 'fishing')!.resources.food, 3);
          save(`C051-N2-deposit-${round}`, r);
      }
  });
  it('C051 N3 no initial food cannot be borrowed from Fishing while owner hand and unrelated controls stay legal', () => {
      const card = 'C051_FishingNet', blocked = setup(card, 14, st => { st.currentPlayerIndex = 1; st.players[1]!.resources.food = 0; st.actionSpaces.find(a => a.id === 'fishing')!.resources.food = 3; });
      assertRejectedUnchanged(blocked, () => blocked.takeAction(1, 'fishing'));
      assert.equal(blocked.state.players[1]!.resources.food, 0);
      save('C051-N3-blocked', blocked.getState());
      for (const mode of ['owner', 'hand', 'unrelated']) {
          const s = setup(card, 14, st => {
              st.players[0]!.resources.food = 0;
              st.players[1]!.resources.food = 0;
              st.actionSpaces.find(a => a.id === 'fishing')!.resources.food = 3;
              if (mode !== 'owner')
                  st.currentPlayerIndex = 1;
              if (mode === 'hand')
                  hand(st, card);
          });
          const r = finish(s, take(s, mode === 'unrelated' ? 'forest' : 'fishing'), true);
          assert.equal(r.state.players[0]!.resources.food, mode === 'owner' ? 3 : 0);
          assert.equal(r.state.players[1]!.resources.food, mode === 'hand' ? 3 : 0);
          save(`C051-N3-${mode}`, r);
      }
  });
})
