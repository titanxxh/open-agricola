import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { ActionChoiceOption, GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { setWorkersAtHome } from '../../shared/domain/player'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { canRenovate } from '../../shared/actions/effects/renovation'

const WORKER = 'D127_HardworkingMan'
const SHED = 'A010_WoodenShed'
const ROAD = 'A002_ShiftingCultivation'
const MANAGER = 'D095_SiteManager'
const BANK = 'E027_PiggyBank'
const MERCHANT = 'B103_FieldMerchant'
const RECRUITMENT = 'D021_Recruitment'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

// Confirmed #1128 seam: Session action grants, choices, purchases and payments.
// D127 is a printed 3+ card; unrelated purchase paths use the default two players.
const setup = ({ worker = true, configure }: { worker?: boolean; configure?: (state: GameState) => void } = {}) => {
  const session = createWorkSession({
    seed: 42,
    options: { playerCount: worker ? 3 : 2 },
    configure(state) {
      state.round = 5
      state.currentPlayerIndex = 0
      for (const [index, player] of state.players.entries()) {
        setWorkersAtHome(state, player, 2)
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.fields = []
        player.stableTiles = []
        player.pastures = []
        player.rooms = index === 0 ? 2 : 4
        player.roomTiles = index === 0
          ? [{ row: 1, col: 0 }, { row: 2, col: 0 }]
          : [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }]
        Object.assign(player.resources, {
          food: 20, wood: 20, clay: 20, reed: 20, stone: 20,
          grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0,
        })
      }
      state.players[0]!.minorHand = [ROAD, SHED]
      if (worker) {
        state.players[0]!.occupationPlayed = [WORKER]
        state.actionSpaces.push(...createPlayerActionSpaces(state))
      }
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}

const options = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
    throw new Error(`Expected choice: ${JSON.stringify(response.interaction)}`)
  }
  expect(response.interaction.playerIndex).toBe(0)
  return response.interaction.request.options
}

const choose = (session: GameSession, response: SessionResponse, predicate: (option: ActionChoiceOption) => boolean) => {
  const option = options(response).find(predicate)
  if (!option) throw new Error(`Missing option: ${JSON.stringify(response.interaction)}`)
  return session.resolveChoice(0, option.value)
}

const startWorkerImprovement = (session: GameSession, expectedBranches = 3) => {
  const placed = session.takeAction(0, WORKER)
  expect(placed.state.actionSpaces.find((space) => space.id === WORKER)?.takenBy).toHaveLength(1)
  expect(options(placed).filter((option) => option.value !== '__done__')).toHaveLength(expectedBranches)
  return choose(session, placed, (option) => option.labelKey === 'actions.improvement.name' ||
    option.labelParams?.actionNameKey === 'actions.improvement.name')
}

const enterPurchase = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 3; step += 1) {
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice' &&
      response.interaction.request.options.some((option) => option.value === ROAD || option.value === SHED || option.value.startsWith('Major_'))) {
      return response
    }
    response = choose(session, response, (option) => option.value !== '__skip__')
  }
  throw new Error('Expected improvement purchase choice')
}

const snapshot = ({ state, interaction, scores }: SessionResponse) => JSON.stringify({ state, interaction, scores })

describe('major action purchase eligibility', () => {
  it('excludes ordinary minor improvements from D127 and rejects a forged submission without changing the choice', () => {
    const session = setup()
    const offered = startWorkerImprovement(session)

    expect(options(offered).map((option) => option.value)).not.toContain(ROAD)
    const before = snapshot(offered)
    const rejected = session.resolveChoice(0, ROAD)
    expect(rejected.ok).toBe(false)
    expect(snapshot(rejected)).toBe(before)
    const bought = session.resolveChoice(0, 'Major_Fireplace1')
    expect(bought.ok, bought.error).toBe(true)
    expect(bought.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(bought.state.players[0]!.resources.clay).toBe(18)
  })

  it('offers Wooden Shed as the sole affordable D127 improvement while preserving its minor identity', () => {
    const session = setup({ configure(state) {
      state.availableMajorImprovements = []
      state.majorImprovementSupply = []
      state.players[0]!.minorHand = [SHED]
    } })
    const offered = startWorkerImprovement(session)

    expect(options(offered).map((option) => option.value)).toEqual([SHED])
    const bought = session.resolveChoice(0, SHED)
    expect(bought.ok, bought.error).toBe(true)
    const owner = bought.state.players[0]!
    expect(owner.resources).toMatchObject({ wood: 18, reed: 19 })
    expect(owner.minorHand).not.toContain(SHED)
    expect(owner.minorPlayed).toContain(SHED)
    expect(owner.improvements).not.toContain(SHED)
    expect(bought.state.availableMajorImprovements).not.toContain(SHED)
    expect(getExtraRoomCapacity(owner)).toBe(1)
    expect(canRenovate(owner)).toBe(false)
    expect(bought.state.events.find((event) => event.type === 'card.played' && event.cardId === SHED)).toMatchObject({
      cardType: 'minor',
    })
  })

  it('keeps D127 hooks major-only when Field Merchant replaces the opportunity', () => {
    const session = setup({ configure(state) {
      state.players[0]!.occupationPlayed.push(MERCHANT)
    } })
    const offered = startWorkerImprovement(session)
    const replaced = choose(session, offered, (option) => option.sourceCard === MERCHANT)

    expect(replaced.ok, replaced.error).toBe(true)
    expect(replaced.state.players[0]!.resources).toMatchObject({ food: 20, vegetable: 1 })
    expect(replaced.state.players[0]!.minorPlayed).not.toContain(SHED)
  })

  it('does not offer Recruitment family growth for the D127 major opportunity', () => {
    const session = setup({ configure(state) {
      const owner = state.players[0]!
      owner.minorPlayed.push(RECRUITMENT)
      owner.rooms = 3
      owner.roomTiles.push({ row: 0, col: 0 })
    } })
    const offered = startWorkerImprovement(session)

    expect(options(offered).some((option) => option.sourceCard === RECRUITMENT)).toBe(false)
    expect(options(offered).map((option) => option.value)).toContain(SHED)
  })

  it.each([MANAGER, BANK])('rejects the named-action minor exception in the %s building effect', (card) => {
    const session = setup({ worker: false, configure(state) {
      if (card === MANAGER) state.players[0]!.occupationHand = [card]
      else {
        state.players[0]!.minorPlayed = [card]
        state.players[0]!.cardStates[card] = { counters: { food: 6 } }
      }
    } })
    let offered: SessionResponse
    if (card === MANAGER) {
      offered = session.takeAction(0, 'lessons')
      if (offered.state.players[0]!.occupationHand.includes(card)) {
        offered = session.resolveChoice(0, card)
      }
      if (offered.interaction.stateId === 'wait' && offered.interaction.request.kind === 'select-trigger') {
        offered = session.resolveChoice(0, card)
      }
      offered = choose(session, offered, (option) => option.value !== '__skip__')
    } else {
      offered = session.takeAnytimeAction(0, 'E27-piggy-bank-anytime')
    }
    expect(options(offered).map((option) => option.value)).not.toContain(SHED)
    expect(options(offered).map((option) => option.value)).not.toContain(ROAD)
    const before = snapshot(offered)
    for (const rejectedCard of [SHED, ROAD]) {
      const rejected = session.resolveChoice(0, rejectedCard)
      expect(rejected.ok).toBe(false)
      expect(snapshot(rejected)).toBe(before)
    }
    let bought = session.resolveChoice(0, 'Major_Fireplace1')
    if (card === MANAGER) {
      bought = choose(session, bought, (option) =>
        (option.effectPreview?.kind === 'payment' || option.effectPreview?.kind === 'resourceExchange') &&
        option.effectPreview.resourcesPaid?.clay === 2)
    }
    expect(bought.ok, bought.error).toBe(true)
    expect(bought.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(bought.state.players[0]!.resources.clay).toBe(card === MANAGER ? 18 : 20)
    expect(bought.state.players[0]!.minorHand).toContain(SHED)
    expect(bought.state.players[0]!.minorPlayed).not.toContain(SHED)
  })

  it('rejects Wooden Shed on a pure minor opportunity and allows it on the ordinary Major Improvement space', () => {
    const minorSession = setup({ worker: false, configure(state) {
      state.players[0]!.minorHand.push('A004_Baseboards')
    } })
    const minor = enterPurchase(minorSession, minorSession.takeAction(0, 'meeting-place'))
    expect(options(minor).map((option) => option.value)).not.toContain(SHED)
    expect(options(minor).map((option) => option.value)).toContain(ROAD)
    const before = snapshot(minor)
    for (const rejectedCard of [SHED, 'Major_Fireplace1']) {
      const rejected = minorSession.resolveChoice(0, rejectedCard)
      expect(rejected.ok).toBe(false)
      expect(snapshot(rejected)).toBe(before)
    }

    const majorSession = setup({ worker: false })
    const major = enterPurchase(majorSession, majorSession.takeAction(0, 'major-improvement'))
    expect(options(major).map((option) => option.value)).toContain(SHED)
    const bought = majorSession.resolveChoice(0, SHED)
    expect(bought.ok, bought.error).toBe(true)
    expect(bought.state.players[0]!.resources).toMatchObject({ wood: 18, reed: 19 })
    expect(bought.state.players[0]!.minorPlayed).toContain(SHED)
  })

  it.each([
    { name: 'missing wood', wood: 1, reed: 20, houseType: 'wood', branches: 2 },
    { name: 'missing reed', wood: 20, reed: 0, houseType: 'wood', branches: 2 },
    { name: 'a clay house', wood: 20, reed: 20, houseType: 'clay', branches: 3 },
  ] satisfies Array<{ name: string; wood: number; reed: number; houseType: 'wood' | 'clay'; branches: number }>)('retains Wooden Shed prerequisites and cost checks for $name', ({ wood, reed, houseType, branches }) => {
    const session = setup({ configure(state) {
      const owner = state.players[0]!
      owner.resources.wood = wood
      owner.resources.reed = reed
      owner.houseType = houseType
    } })
    const offered = startWorkerImprovement(session, branches)

    expect(options(offered).map((option) => option.value)).not.toContain(SHED)
    const before = snapshot(offered)
    expect(session.resolveChoice(0, SHED).ok).toBe(false)
    expect(snapshot(session.getState())).toBe(before)
  })

  it('retains D127 owner-only access', () => {
    const session = setup({ configure(state) { state.currentPlayerIndex = 1 } })
    const before = snapshot(session.getState())
    const rejected = session.takeAction(1, WORKER)

    expect(rejected.ok).toBe(false)
    expect(snapshot(rejected)).toBe(before)
  })

  it('continues D127 subactions and can undo then repurchase the minor exception once', () => {
    const session = setup()
    startWorkerImprovement(session)
    const bought = session.resolveChoice(0, SHED)
    expect(bought.ok, bought.error).toBe(true)
    const worked = choose(session, bought, (option) => option.labelKey === 'actions.day-laborer.name')
    expect(worked.state.players[0]!.resources).toMatchObject({ wood: 18, reed: 19, food: 22 })
    const done = session.resolveChoice(0, '__done__')
    expect(done.ok, done.error).toBe(true)
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.minorHand).toContain(SHED)
    expect(undone.state.players[0]!.minorPlayed).not.toContain(SHED)
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 20, reed: 20, food: 20 })
    const retry = startWorkerImprovement(session)
    expect(options(retry).map((option) => option.value)).toContain(SHED)
    const repurchased = session.resolveChoice(0, SHED)
    expect(repurchased.ok, repurchased.error).toBe(true)
    expect(repurchased.state.players[0]!.minorPlayed.filter((id) => id === SHED)).toHaveLength(1)
    expect(repurchased.state.players[0]!.resources).toMatchObject({ wood: 18, reed: 19 })
  })
})
