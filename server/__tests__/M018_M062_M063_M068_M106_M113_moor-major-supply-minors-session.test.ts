import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { Scoring } from '../../shared/domain'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import { getMajorImprovementPreviewCostDetailed } from '../../shared/actions/helpers/improvement-helpers'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import { M113_LivingHistoryMuseum } from '../../shared/cards/M/M113_LivingHistoryMuseum'
import { M068_Church } from '../../shared/cards/M/M068_Church'
import type { ActionFlow, GameState, Resource } from '../../shared/contract/types'

const PLACEHOLDER = '__test_placeholder__'

const fullResources = (overrides: Partial<Resource> = {}): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  fuel: 0,
  horse: 0,
  ...overrides,
})

const setup = () => {
  const session = new GameSession(383, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  for (const [index, player] of state.players.entries()) {
    player.resources = fullResources()
    player.minorHand = [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
    player.improvements = []
    player.minorPlayed = []
    player.occupationPlayed = []
    setWorkersAtHome(state, player, index === 0 ? 3 : 0)
  }
  session.loadState(state)
  return session
}

const stackFor = (state: GameState, familyId: string) => {
  const stack = state.majorImprovementSupply?.find((entry) => entry.familyId === familyId)
  expect(stack).toBeDefined()
  return stack!
}

const playMinor = (session: GameSession, cardId: string) => {
  const state = session.getState().state
  state.players[0]!.minorHand = [cardId]
  session.loadState(state)
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const option = resp.interaction.request.options?.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  resp = session.resolveChoice(0, option!.value)
  expect(resp.ok).toBe(true)
  return resp
}

const choosePaymentIfNeeded = (session: GameSession, playerIndex = 0) => {
  let resp = session.getState()
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const option = resp.interaction.request.options?.[0]
    expect(option).toBeDefined()
    resp = session.resolveChoice(playerIndex, option!.value)
    expect(resp.ok).toBe(true)
  }
  return resp
}

const bonusVp = (state: GameState, playerIndex = 0) =>
  Scoring.breakdown(state, playerIndex).categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0

const actionIds = (flow: ActionFlow | null | undefined): string[] => {
  if (!flow) return []
  if (flow.type === 'leaf') return [flow.actionId]
  return flow.children.flatMap(actionIds)
}

describe('Moor major-supply and upgrade minors', () => {
  it('M018 buys only a visible craft major without a person and pays 1 stone less', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.improvements = ['Major_Fireplace1', 'Major_ClayOven']
    player.resources = fullResources({ wood: 2, clay: 2, reed: 2, stone: 1 })

    let resp = playMinor(session, 'M018_RegisterOfCraftsmen')

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const values = resp.interaction.request.options?.map((option) => option.value) ?? []
    expect(values).toContain('Major_Joinery')
    expect(values).not.toContain('Major_Moor_FurnitureStall')

    resp = session.resolveChoice(0, 'Major_Joinery')
    expect(resp.ok).toBe(true)
    resp = choosePaymentIfNeeded(session)

    expect(resp.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 2, reed: 2, stone: 0 })
    expect(resp.state.availableMajorImprovements).toContain('Major_Moor_FurnitureStall')
    expect(resp.state.players[1]!.minorHand).toContain('M018_RegisterOfCraftsmen')
  })

  it('M018 does not offer the discounted craft major when the player still cannot pay', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.improvements = ['Major_Fireplace1', 'Major_ClayOven']
    player.resources = fullResources({ clay: 2, reed: 2, stone: 1 })

    const resp = playMinor(session, 'M018_RegisterOfCraftsmen')

    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.options?.map((option) => option.value) ?? []).not.toContain('Major_Joinery')
    }
    expect(resp.state.players[0]!.improvements).not.toContain('Major_Joinery')
  })

  it('M062 moves up Tiled Oven and only offers the post-action purchase from the next round when affordable', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.resources = fullResources({ reed: 1, clay: 2, stone: 1 })

    const offered = playMinor(session, 'M062_HearthBrush')
    const move = offered.interaction.request.options.find((option) => option.value !== '__skip__')!
    const resp = session.resolveChoice(0, move.value)
    expect(resp.ok).toBe(true)

    expect(stackFor(resp.state, 'stone-oven')).toMatchObject({
      visibleId: 'Major_Moor_TiledOven',
      cardIds: ['Major_Moor_TiledOven', 'Major_StoneOven'],
    })
    expect(resp.state.availableMajorImprovements).toContain('Major_Moor_TiledOven')

    expect(runCardEffectHook(resp.state, resp.state.players[0]!, 'M062_HearthBrush', 'onEndTurn')).toBeNull()
    resp.state.round = 6
    expect(runCardEffectHook(resp.state, resp.state.players[0]!, 'M062_HearthBrush', 'onEndTurn')).toBeNull()
    expect(runCardEffectHook(
      resp.state,
      resp.state.players[0]!,
      'M062_HearthBrush',
      'onEndTurn',
      undefined,
      { triggerActionId: 'cut-peat' },
    )).toBeNull()
    const flow = runCardEffectHook(
      resp.state,
      resp.state.players[0]!,
      'M062_HearthBrush',
      'onEndTurn',
      undefined,
      { triggerActionId: 'place-farmer' },
    )
    expect(actionIds(flow)).toEqual(['improvement'])

    resp.state.players[0]!.resources = fullResources({ reed: 1, clay: 2, stone: 1 })
    resp.state.currentPlayerIndex = 0
    session.loadState(resp.state)
    const actionResp = session.takeAction(0, 'forest')
    expect(actionResp.ok).toBe(true)
    expect(actionResp.interaction.stateId).toBe('wait')
    expect(actionResp.interaction.stateId === 'wait' ? actionResp.interaction.sourceCard : undefined)
      .toBe('M062_HearthBrush')

    resp.state.players[0]!.resources = fullResources()
    expect(runCardEffectHook(resp.state, resp.state.players[0]!, 'M062_HearthBrush', 'onEndTurn')).toBeNull()
  })

  it('M062 does not offer hidden Tiled Oven before it is moved to the supply top', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed.push('M062_HearthBrush')
    player.resources = fullResources({ reed: 1, clay: 2, stone: 1 })
    writeCardExtraData(player, 'M062_HearthBrush', 'playedRound', 4)

    const flow = runCardEffectHook(
      session.state,
      player,
      'M062_HearthBrush',
      'onEndTurn',
      undefined,
      { triggerActionId: 'place-farmer' },
    )

    expect(flow).toBeNull()
  })

  it('M063 moves up Village Church and scores Church plus Village Church', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.improvements = ['Major_Fireplace1', 'Major_ClayOven']

    const offered = playMinor(session, 'M063_PastoralLetter')
    const move = offered.interaction.request.options.find((option) => option.value !== '__skip__')!
    const resp = session.resolveChoice(0, move.value)
    expect(resp.ok).toBe(true)

    expect(stackFor(resp.state, 'well')).toMatchObject({
      visibleId: 'Major_Moor_VillageChurch',
      cardIds: ['Major_Moor_VillageChurch', 'Major_Well'],
    })
    const owner = resp.state.players[0]!
    resp.state.round = 6
    owner.resources = fullResources({ wood: 2, stone: 4 })
    expect(runCardEffectHook(resp.state, owner, 'M063_PastoralLetter', 'onEndTurn')).toBeNull()
    expect(runCardEffectHook(
      resp.state,
      owner,
      'M063_PastoralLetter',
      'onEndTurn',
      undefined,
      { triggerActionId: 'place-farmer' },
    )).not.toBeNull()

    owner.minorPlayed.push('M068_Church')
    owner.improvements.push('Major_Moor_VillageChurch')
    expect(bonusVp(resp.state)).toBe(2)
  })

  it('M068 upgrades Village Church, gains 2 food, and offers returning-home fuel for VP', () => {
    const session = setup()
    const player = session.state.players[0]!
    takeMajorImprovementFromSupply(session.state, 'Major_Moor_VillageChurch')
    player.improvements = ['Major_Moor_VillageChurch']
    player.resources = fullResources({ fuel: 1 })

    let resp = playMinor(session, 'M068_Church')
    resp = choosePaymentIfNeeded(session)

    expect(resp.state.players[0]!.improvements).not.toContain('Major_Moor_VillageChurch')
    expect(resp.state.availableMajorImprovements).not.toContain('Major_Moor_VillageChurch')
    expect(stackFor(resp.state, 'well').cardIds).not.toContain('Major_Moor_VillageChurch')
    expect(resp.state.players[0]!.minorPlayed).toContain('M068_Church')
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(actionIds(runCardEffectHook(resp.state, resp.state.players[0]!, 'M068_Church', 'onStartReturnHome')))
      .toEqual(['pay', 'bonus-vp'])
  })

  it('M068 cannot be played without Village Church in play', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.resources = fullResources({ fuel: 1 })

    expect(meetsCardPrerequisites(player, M068_Church, session.state.round, session.state)).toBe(false)
    player.minorHand = ['M068_Church']
    session.loadState(session.state)
    const resp = session.takeAction(0, 'meeting-place')

    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.options?.map((option) => option.value) ?? []).not.toContain('M068_Church')
    }
    expect(resp.state.players[0]!.minorPlayed).not.toContain('M068_Church')
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('M106 exposes horse and 2-horse cookery exchanges and keeps Horse Slaughterhouses under Fireplaces', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed = ['M106_HorseButchery']
    player.resources = fullResources({ horse: 2 })

    expect(stackFor(session.state, 'fireplace-1')).toMatchObject({
      visibleId: 'Major_Fireplace1',
      cardIds: ['Major_Fireplace1', 'Major_Moor_HorseSlaughterhouse1'],
    })
    expect(stackFor(session.state, 'fireplace-2')).toMatchObject({
      visibleId: 'Major_Fireplace2',
      cardIds: ['Major_Fireplace2', 'Major_Moor_HorseSlaughterhouse2'],
    })

    const trades = getExchangesInWindow(player, 'anytime', session.state)
    expect(trades).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: { horse: 1 }, to: { food: 2 }, sourceId: 'M106_HorseButchery' }),
      expect.objectContaining({ from: { horse: 2 }, to: { food: 5 }, sourceId: 'M106_HorseButchery' }),
    ]))

    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    expect(session.takeAnytimeAction(0, 'exchange').ok).toBe(true)
    const twoHorseIndex = trades.findIndex((trade) => trade.from.horse === 2)
    const resp = session.resolveChoice(0, `trade:${twoHorseIndex}:1`)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ horse: 0, food: 5 })
  })

  it('M113 requires a clay house and discounts Farmers of the Moor major upgrades', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.houseType = 'wood'
    expect(meetsCardPrerequisites(player, M113_LivingHistoryMuseum, session.state.round, session.state)).toBe(false)

    player.houseType = 'clay'
    expect(meetsCardPrerequisites(player, M113_LivingHistoryMuseum, session.state.round, session.state)).toBe(true)
    player.minorPlayed = ['M113_LivingHistoryMuseum']

    const tiled = getMajorImprovementPreviewCostDetailed(
      session.state,
      player,
      'Major_Moor_TiledOven',
      'major-improvement',
    )?.cost as { fees?: Array<Record<string, number>> }
    const riding = getMajorImprovementPreviewCostDetailed(
      session.state,
      player,
      'Major_Moor_RidingStables',
      'major-improvement',
    )?.cost as { fees?: Array<Record<string, number>> }

    expect(tiled.fees).toContainEqual({ clay: 2 })
    expect(riding.fees).toContainEqual({ wood: 1, clay: 1, reed: 1 })
  })
})
