import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { D161_CabbageBuyer_impl } from '../../shared/cards/D/D161_CabbageBuyer'
import '../../shared/cards/A/A055_JunkRoom'
import '../../shared/cards/D/D013_Trowel'
import type { ActionFlow } from '../../shared/contract/types'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'

const CARD_ID = 'D161_CabbageBuyer'

/**
 * Helper: set up a 2-player session.
 * p0 = D161 owner (unless withCard=false).
 * p1 = the player who will take house-redevelopment.
 * round=6 so house-redevelopment is available.
 */
const setup = (options?: {
  ownerPlayerIndex?: number      // which player owns D161 (default: 0)
  withCard?: boolean             // whether D161 is played (default: true)
  ownerFood?: number             // food for D161 owner (default: 10)
  actorPlayerIndex?: number      // which player takes house-redev (default: 1)
}) => {
  const ownerIdx = options?.ownerPlayerIndex ?? 0
  const actorIdx = options?.actorPlayerIndex ?? 1
  const withCard = options?.withCard ?? true
  const ownerFood = options?.ownerFood ?? 10

  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = actorIdx
  state.round = 6

  const owner = state.players[ownerIdx]!
  const actor = state.players[actorIdx]!

  // D161 owner setup
  if (withCard) {
    owner.occupationPlayed.push(CARD_ID)
    owner.playedCards = owner.playedCards ?? []
    owner.playedCards.push(`occupation:${CARD_ID}`)
  }
  owner.resources.food = ownerFood
  owner.resources.clay = 10
  owner.resources.reed = 10
  owner.resources.stone = 10
  owner.resources.wood = 10
  owner.houseType = 'wood'
  owner.rooms = 2
  setWorkersAtHome(state, owner, 2)

  // Actor setup (takes house-redevelopment)
  actor.resources.food = 10
  actor.resources.clay = 10
  actor.resources.reed = 10
  actor.resources.stone = 10
  actor.resources.wood = 10
  actor.houseType = 'wood'
  actor.rooms = 2
  setWorkersAtHome(state, actor, 2)

  // Make Fireplace1 available
  if (!state.availableMajorImprovements.includes('Major_Fireplace1')) {
    state.availableMajorImprovements.push('Major_Fireplace1')
  }

  session.loadState(state)
  return session
}

const setupD161DirectListeners = () => {
  const session = setup()
  const state = session.getState().state
  const owner = state.players[0]!
  const actor = state.players[1]!
  const open = D161_CabbageBuyer_impl.listeners.find((l) => l.id === 'D161-cabbage-buyer-open-tracker')!
  const tagImprovement = D161_CabbageBuyer_impl.listeners.find((l) => l.id === 'D161-cabbage-buyer-tag-improvement')!
  const offer = D161_CabbageBuyer_impl.listeners.find((l) => l.id === 'D161-cabbage-buyer-drain-offer')!
  return { state, owner, actor, open, tagImprovement, offer }
}

const getD161OfferCost = (flow: ActionFlow | undefined) => {
  if (!flow) return undefined
  if (flow.type === 'leaf') {
    return flow.actionId === 'pay'
      ? (flow.params as { food?: number } | undefined)?.food
      : undefined
  }
  if (!('children' in flow)) return undefined
  return flow.children.map(getD161OfferCost).find((cost) => cost !== undefined)
}

const applyStateFlow = (
  flow: ActionFlow | undefined,
  state: ReturnType<GameSession['getState']>['state'],
  player: typeof state.players[number],
) => {
  if (!flow) return
  if (flow.type !== 'leaf') {
    if ('children' in flow) flow.children.forEach((child) => applyStateFlow(child, state, player))
    return
  }
  if (flow.actionId === 'special-effect') {
    specialEffectAction.execute({
      state,
      player,
      params: flow.params,
      sourceCard: flow.sourceCard,
      actionContext: flow.actionContext,
    } as never)
  }
}

const openDirectD161Tracker = (
  setupResult: ReturnType<typeof setupD161DirectListeners>,
  options?: { spaceId?: string; food?: number; choice?: string },
) => {
  const { state, owner, actor, open, tagImprovement, offer } = setupResult
  if (options?.food !== undefined) owner.resources.food = options.food
  const openResult = open.handler({
    state,
    player: actor,
    ownerPlayer: owner,
    space: { id: options?.spaceId ?? 'house-redevelopment' } as never,
    actionId: 'renovate-house',
    phase: 'after',
  } as never)
  applyStateFlow(openResult?.flow, state, actor)
  if (options?.choice) {
    const tagResult = tagImprovement.handler({
      state,
      player: actor,
      ownerPlayer: owner,
      actionId: 'improvement',
      phase: 'after',
      choice: options.choice,
    } as never)
    applyStateFlow(tagResult?.flow, state, actor)
  }
  const result = offer.handler({
    state,
    player: actor,
    ownerPlayer: owner,
    actionId: 'place-farmer',
    phase: 'after',
  } as never)
  applyStateFlow(result?.flow, state, actor)
  return result
}

/**
 * Drive the house-redevelopment flow up to the point where renovation is done
 * and the improvement choice (if any) is presented.
 *
 * Returns { resp, renovationDone } where:
 *   - resp is the SessionResponse after the renovation step (pending=choice for improvement)
 *   - renovationDone is true if we reached the improvement stage
 */
const driveRenovation = (session: GameSession, actorIdx: number) => {
  let resp = session.takeAction(actorIdx, 'house-redevelopment')
  if (!resp.ok) return { resp, renovationDone: false }

  // After takeAction for house-redevelopment, the engine may immediately resolve
  // the renovation (since the material choice is often auto-resolved when only
  // one option is available) or present a choice between 'clay' and 'stone'.
  // Walk through any material choices for the renovation.
  let safety = 5
  while (resp.interaction.stateId === 'wait' && safety-- > 0) {
    const opts = resp.interaction.request.options ?? []
    // Check if this is the renovation material choice (clay/stone)
    const hasMatChoice = opts.some((o) => o.value === 'clay' || o.value === 'stone')
    if (hasMatChoice) {
      resp = session.resolveChoice(actorIdx, 'clay')
      break
    }
    // If we see improvement options, stop here
    const hasImprovementChoice = opts.some(
      (o) => o.value === '__skip__' || o.value.startsWith('Major_') || /^[A-Z]\d+_/.test(o.value),
    )
    if (hasImprovementChoice) break
    // Otherwise keep going
    const first = opts[0]
    if (!first) break
    resp = session.resolveChoice(actorIdx, first.value)
  }

  return { resp, renovationDone: true }
}

/**
 * Skip the improvement step (pick __skip__).
 */
const skipImprovement = (session: GameSession, actorIdx: number, resp: ReturnType<GameSession['takeAction']>) => {
  if (resp.interaction.stateId === 'wait') {
    const skipOpt = resp.interaction.request.options?.find((o) => o.value === '__skip__')
    if (skipOpt) {
      resp = session.resolveChoice(actorIdx, '__skip__')
    }
  }
  return resp
}

/**
 * Accept the optional "play an improvement" step so the actual improvement
 * picker (`ui.interactionChooseImprovement`) is shown.
 */
const enterImprovementChoice = (
  session: GameSession,
  actorIdx: number,
  resp: ReturnType<GameSession['takeAction']>,
) => {
  if (resp.interaction.stateId !== 'wait') return resp
  const enterOpt = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
  if (!enterOpt) return resp
  return session.resolveChoice(actorIdx, enterOpt.value)
}

/**
 * Build a specific major improvement during house-redevelopment.
 */
const buildMajor = (session: GameSession, actorIdx: number, resp: ReturnType<GameSession['takeAction']>, majorId: string) => {
  resp = enterImprovementChoice(session, actorIdx, resp)
  if (resp.interaction.stateId !== 'wait') return resp
  const opt = resp.interaction.request.options?.find((o) => o.value === majorId)
  if (!opt) return resp
  resp = session.resolveChoice(actorIdx, opt.value)
  // Drain any sub-choices (e.g. fireplace mode selection)
  let safety = 5
  while (resp.interaction.stateId === 'wait' && safety-- > 0) {
    const opts = resp.interaction.request.options ?? []
    // Stop if we see the D161 offer (has __skip__ and is for the owner cross-player)
    const hasSkip = opts.some((o) => o.value === '__skip__')
    if (hasSkip && resp.interaction.playerIndex !== actorIdx) break
    // If skip is for actor and it's the D161 offer (after improvement), also break
    // but we need to detect we've landed on D161 offer vs a normal improvement choice
    // We'll just break when we've exhausted non-skip choices
    const nonSkip = opts.find((o) => o.value !== '__skip__' && o.value !== 'cancel')
    if (!nonSkip) break
    resp = session.resolveChoice(actorIdx, nonSkip.value)
  }
  return resp
}

/**
 * Build a specific minor improvement during house-redevelopment.
 */
const buildMinor = (session: GameSession, actorIdx: number, resp: ReturnType<GameSession['takeAction']>, minorId: string) => {
  resp = enterImprovementChoice(session, actorIdx, resp)
  if (resp.interaction.stateId !== 'wait') return resp
  const opt = resp.interaction.request.options?.find((o) => o.value === minorId)
  if (!opt) return resp
  resp = session.resolveChoice(actorIdx, opt.value)
  let safety = 5
  while (resp.interaction.stateId === 'wait' && safety-- > 0) {
    const opts = resp.interaction.request.options ?? []
    const hasSkip = opts.some((o) => o.value === '__skip__')
    if (hasSkip && resp.interaction.playerIndex !== actorIdx) break
    const nonSkip = opts.find((o) => o.value !== '__skip__' && o.value !== 'cancel')
    if (!nonSkip) break
    resp = session.resolveChoice(actorIdx, nonSkip.value)
  }
  return resp
}

/**
 * Walk confirmPlayerSwitch to advance to the owner's choice.
 */
const walkPlayerSwitch = (session: GameSession, resp: ReturnType<GameSession['takeAction']>) => {
  let r = resp
  let safety = 5
  while (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch' && safety-- > 0) {
    r = confirmPlayerSwitch(session)
  }
  return r
}

// ─── Test cases ──────────────────────────────────────────────────────────────

describe('D161_CabbageBuyer session', () => {
  it('direct tracker opens for non-house renovation action spaces', () => {
    const result = openDirectD161Tracker(setupD161DirectListeners(), {
      spaceId: 'B001_UpscaleLifestyle',
    })

    expect(getD161OfferCost(result?.flow)).toBe(3)
  })

  it.each([
    ['no improvement', undefined, 3],
    ['minor improvement', 'A055_JunkRoom', 2],
    ['major improvement', 'Major_Fireplace1', 1],
  ] as const)('direct price branch: %s costs %s food', (_label, choice, expectedCost) => {
    const result = openDirectD161Tracker(setupD161DirectListeners(), { choice })

    expect(getD161OfferCost(result?.flow)).toBe(expectedCost)
  })

  it('direct price branch: no food emits no offer', () => {
    const result = openDirectD161Tracker(setupD161DirectListeners(), { food: 0 })

    expect(getD161OfferCost(result?.flow)).toBeUndefined()
  })

  // ── Case 1: no improvement → cost = 3 food ──────────────────────────────

  it('T1: no improvement — offer appears with cost=3; accept gives vegetable and costs 3 food', () => {
    const session = setup()
    const ownerFoodBefore = session.getState().state.players[0]!.resources.food
    const ownerVegBefore = session.getState().state.players[0]!.resources.vegetable ?? 0

    // p1 takes house-redevelopment
    let resp = driveRenovation(session, 1).resp

    // Skip the improvement
    resp = skipImprovement(session, 1, resp)

    // After place-farmer fires, D161 listener should trigger.
    // Since p0 is the owner and p1 took the action, we expect a player switch.
    resp = walkPlayerSwitch(session, resp)

    // Now we should see the D161 offer for p0 (cost=3, optional seq)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.playerIndex : -1).toBe(0)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe(CARD_ID)

    // Accept the offer (non-skip option)
    const acceptOpt = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    expect(acceptOpt).toBeDefined()
    expect((acceptOpt as any)?.effectPreview).toEqual({
      kind: 'resourceExchange',
      resourcesPaid: { food: 3 },
      resourcesGained: { vegetable: 1 },
    })
    resp = session.resolveChoice(0, acceptOpt!.value)

    resp = walkPlayerSwitch(session, resp)

    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(ownerFoodBefore - 3)
    expect(after.players[0]!.resources.vegetable).toBe(ownerVegBefore + 1)
  })

  // ── Case 2: major improvement built → cost = 1 food ──────────────────────

  it('T2: major improvement built during house-redevelopment — offer costs 1 food', () => {
    const session = setup()
    const ownerFoodBefore = session.getState().state.players[0]!.resources.food
    const ownerVegBefore = session.getState().state.players[0]!.resources.vegetable ?? 0

    let resp = driveRenovation(session, 1).resp
    resp = buildMajor(session, 1, resp, 'Major_Fireplace1')

    resp = walkPlayerSwitch(session, resp)

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.playerIndex).toBe(0)

    const acceptOpt = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    expect(acceptOpt).toBeDefined()
    resp = session.resolveChoice(0, acceptOpt!.value)

    resp = walkPlayerSwitch(session, resp)

    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(ownerFoodBefore - 1)
    expect(after.players[0]!.resources.vegetable).toBe(ownerVegBefore + 1)
  })

  // ── Case 3: minor improvement built → cost = 2 food ──────────────────────

  it('T3: minor improvement built during house-redevelopment — offer costs 2 food', () => {
    const session = setup()
    const state = session.getState().state
    state.players[1]!.minorHand = ['A055_JunkRoom']
    session.loadState(state)

    const ownerFoodBefore = session.getState().state.players[0]!.resources.food
    const ownerVegBefore = session.getState().state.players[0]!.resources.vegetable ?? 0

    let resp = driveRenovation(session, 1).resp
    resp = buildMinor(session, 1, resp, 'A055_JunkRoom')
    resp = walkPlayerSwitch(session, resp)

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.playerIndex).toBe(0)

    const acceptOpt = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    expect(acceptOpt).toBeDefined()
    resp = session.resolveChoice(0, acceptOpt!.value)

    resp = walkPlayerSwitch(session, resp)

    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(ownerFoodBefore - 2)
    expect(after.players[0]!.resources.vegetable).toBe(ownerVegBefore + 1)
  })

  // ── Case 4: owner self-trigger with no improvement → cost = 3 ────────────

  it('T4: owner (p0) takes house-redevelopment — self-trigger fires, cost=3', () => {
    // Set currentPlayerIndex to 0 so p0 is both owner and actor
    const session = setup({ ownerPlayerIndex: 0, actorPlayerIndex: 0 })

    const ownerFoodBefore = session.getState().state.players[0]!.resources.food
    const ownerVegBefore = session.getState().state.players[0]!.resources.vegetable ?? 0

    let resp = driveRenovation(session, 0).resp

    // Explicitly skip the optional improvement step.
    resp = skipImprovement(session, 0, resp)
    resp = walkPlayerSwitch(session, resp)

    // D161 offer should be presented for p0
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.playerIndex).toBe(0)

    const acceptOpt = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    expect(acceptOpt).toBeDefined()
    resp = session.resolveChoice(0, acceptOpt!.value)

    resp = walkPlayerSwitch(session, resp)

    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(ownerFoodBefore - 3)
    expect(after.players[0]!.resources.vegetable).toBe(ownerVegBefore + 1)
  })

  // ── Case 5: farm-redevelopment triggers D161 ────────────────────────────

  it('T5: farm-redevelopment action triggers D161 offer after renovation', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 10
    const farmRedevIdx = state.roundActionOrder.indexOf('farm-redevelopment')
    if (farmRedevIdx === -1) {
      const nullIdx = state.roundActionOrder.indexOf(null)
      if (nullIdx !== -1) state.roundActionOrder[nullIdx] = 'farm-redevelopment'
    }
    const farmRedevSpace = state.actionSpaces.find((s) => s.id === 'farm-redevelopment')
    expect(farmRedevSpace).toBeDefined()
    state.currentPlayerIndex = 1
    session.loadState(state)

    let resp = session.takeAction(1, 'farm-redevelopment')
    expect(resp.ok).toBe(true)

    let safety = 15
    while (
      resp.interaction.stateId === 'wait' &&
      safety-- > 0
    ) {
      if (resp.interaction.playerIndex === 0 && resp.interaction.sourceCard === CARD_ID) break
      if (resp.interaction.request.kind === 'confirm-player-switch') {
        resp = confirmPlayerSwitch(session)
        continue
      }
      const opts = resp.interaction.request.options ?? []
      const skipOpt = opts.find((o) => o.value === '__skip__')
      if (skipOpt) {
        resp = session.resolveChoice(resp.interaction.playerIndex, '__skip__')
      } else {
        const first = opts[0]
        if (!first) break
        resp = session.resolveChoice(resp.interaction.playerIndex, first.value)
      }
    }

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
  })

  // ── Case 6: owner has 0 food → no offer ─────────────────────────────────

  it('T6: owner has 0 food — no D161 offer presented', () => {
    const session = setup({ ownerFood: 0 })

    let resp = driveRenovation(session, 1).resp
    resp = skipImprovement(session, 1, resp)

    // Walk any player switches — if D161 fires (it shouldn't), we'd get a choice for p0
    let safety = 5
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch' && safety-- > 0) {
      resp = confirmPlayerSwitch(session)
    }

    // p0 cannot afford cost=3, so no offer should appear. The remaining wait
    // is either non-existent or `confirm-next-player` (end-of-turn) — anything
    // is fine except a real `choice` request for p0 (that would be the D161 offer).
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'choice') {
      expect(resp.interaction.playerIndex).not.toBe(0)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(0)
    expect(after.players[0]!.resources.vegetable ?? 0).toBe(0)
  })

  // ── Case 7: owner declines the offer → resources unchanged ───────────────

  it('T7: owner declines the D161 offer — resources unchanged', () => {
    const session = setup()
    const ownerFoodBefore = session.getState().state.players[0]!.resources.food
    const ownerVegBefore = session.getState().state.players[0]!.resources.vegetable ?? 0

    let resp = driveRenovation(session, 1).resp
    resp = skipImprovement(session, 1, resp)

    resp = walkPlayerSwitch(session, resp)

    // Should be the D161 offer for p0
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.playerIndex).toBe(0)

    // Decline (pick __skip__)
    resp = session.resolveChoice(0, '__skip__')
    resp = walkPlayerSwitch(session, resp)

    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(ownerFoodBefore)
    expect(after.players[0]!.resources.vegetable).toBe(ownerVegBefore)
  })

  // ── Case 8: D161 not played → no trigger ────────────────────────────────

  it('T8: D161 not in occupationPlayed — no offer triggered', () => {
    const session = setup({ withCard: false })

    let resp = driveRenovation(session, 1).resp
    resp = skipImprovement(session, 1, resp)

    // Walk any player switches
    let safety = 5
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch' && safety-- > 0) {
      resp = confirmPlayerSwitch(session)
    }

    // No D161 offer should appear — remaining wait should be either idle,
    // a `confirm-next-player` (end-of-turn transition), or anything except a
    // `choice` request for p0 (which would be the D161 offer).
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'choice') {
      expect(resp.interaction.playerIndex).not.toBe(0)
    }

    const after = session.getState().state
    // Owner food and vegetable untouched
    expect(after.players[0]!.resources.vegetable ?? 0).toBe(0)
  })

  it('T9: anytime renovation without worker placement still presents the D161 offer', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push('D013_Trowel')
    player.occupationPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`occupation:${CARD_ID}`)
    player.resources.food = 10
    player.resources.reed = 10
    player.resources.stone = 10
    player.houseType = 'wood'
    player.rooms = 2
    session.loadState(state)

    const resp = session.takeAnytimeAction(0, 'D13-trowel-anytime')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.playerIndex : -1).toBe(0)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe(CARD_ID)
    const acceptOpt = resp.interaction.stateId === 'wait'
      ? resp.interaction.request.options?.find((o) => o.value !== '__skip__')
      : undefined
    expect(acceptOpt?.effectPreview).toEqual({
      kind: 'resourceExchange',
      resourcesPaid: { food: 3 },
      resourcesGained: { vegetable: 1 },
    })
  })
})
