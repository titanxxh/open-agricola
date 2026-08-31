import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  readCardExtraData,
  writeCardExtraData,
  setCardFlag,
} from '../../shared/cards/helpers/card-state'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { dispatchTradeAppliedListener } from '../../shared/actions/helpers/trade-applied-listener'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import type { InitialStateOptions } from '../../shared/session/state-constants'

import '../../shared/cards/E/E091_PlowBuilder'
import type { AnytimeAction } from '../../shared/contract/types'

const CARD_ID = 'E091_PlowBuilder'

describe('E091_PlowBuilder session', () => {
  const setup = (round = 4, options?: { joineryUsed?: boolean }) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    // Give the player Major_Joinery and food
    const st2 = session.getState().state
    const p = st2.players[0]!
    p.improvements.push('Major_Joinery')
    p.resources.food = 5
    if (options?.joineryUsed !== false) {
      writeCardExtraData(p, CARD_ID, 'usedJoinery', true)
    }
    session.loadState(st2)

    return session
  }

  /** Take farmland action to enter active interaction */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  const setupMinorImprovement = (
    options: InitialStateOptions = { playerCount: 2 },
    revealJoinerySuccessor = false,
  ) => {
    const session = new GameSession(91, undefined, options)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 3
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    state.players.forEach((player, index) => {
      player.workersAvailable = index === 0 ? 1 : 0
      player.familySize = 1
    })
    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    owner.minorHand = ['B007_Wage']
    owner.resources = {
      ...owner.resources,
      food: 10,
      wood: 5,
      clay: 5,
      stone: 5,
      reed: 5,
    }
    if (revealJoinerySuccessor) takeMajorImprovementFromSupply(state, 'Major_Joinery')
    session.loadState(state)
    return session
  }

  const enterMinorChoice = (session: GameSession) => {
    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, 'action-improvement-1')
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  const setupHarvest = () => {
    const session = new GameSession(91)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    state.players.forEach((player, index) => {
      setActiveWorkerCount(player, index === 0 ? 1 : 0)
      markAllWorkersUsed(state, player)
      player.resources.food = 0
    })
    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    owner.minorPlayed.push('D060_LargePottery')
    owner.improvements.push('Major_Joinery')
    owner.resources.wood = 1
    owner.resources.clay = 1
    owner.resources.food = 5
    session.loadState(state)
    return session
  }

  it('does not arm or become available during the work phase of a harvest round', () => {
    const session = setup(4, { joineryUsed: false })
    const state = session.getState().state
    const player = state.players[0]!
    dispatchTradeAppliedListener(
      state,
      player,
      { from: { wood: 1 }, to: { food: 2 }, sourceId: 'Major_Joinery' },
      1,
    )
    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBeFalsy()
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('E91-plow-builder-anytime')
  })

  it('uses Joinery during the real harvest, pays 1 food, and plows 1 field', () => {
    const session = setupHarvest()
    let resp = session.performRoundEnd()

    expect(resp.state.roundPhase).toBe('harvest')
    expect(readCardExtraData<boolean>(resp.state.players[0]!, CARD_ID, 'usedJoinery')).toBe(true)
    expect(resp.interaction.anytimeActions.map((action) => action.id))
      .toContain('E91-plow-builder-anytime')

    resp = session.takeAnytimeAction(0, 'E91-plow-builder-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.players[0]!.resources.food).toBe(6)
    const tile = resp.interaction.request.farm.selectableTiles[0]
    expect(tile).toBeDefined()
    resp = session.commitSelectionChoice(0, { tile })
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    expect(p.fields).toContainEqual(expect.objectContaining(tile))
    expect(p.cardStates?.[CARD_ID]?.flagged).toBe(true)
    expect(resp.interaction.anytimeActions.map((action) => action.id))
      .not.toContain('E91-plow-builder-anytime')
    expect(resp.state.events).toContainEqual(expect.objectContaining({ type: 'farm.fieldPlowed' }))
  })

  it('builds Joinery through a Minor Improvement action and normal payment', () => {
    const session = setupMinorImprovement()
    const before = { ...session.state.players[0]!.resources }
    let resp = enterMinorChoice(session)
    const values = resp.interaction.request.options?.map((option) => option.value) ?? []
    expect(values).toContain('Major_Joinery')
    expect(values).not.toContain('Major_Pottery')

    resp = session.resolveChoice(0, 'Major_Joinery')
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
      const payment = resp.interaction.request.options?.find((option) => option.value !== 'cancel')
      expect(payment).toBeDefined()
      resp = session.resolveChoice(0, payment!.value)
    }

    expect(resp.state.players[0]!.resources.wood).toBe(before.wood - 2)
    expect(resp.state.players[0]!.resources.stone).toBe(before.stone - 2)
    expect(resp.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(resp.state.availableMajorImprovements).not.toContain('Major_Joinery')
    expect(resp.state.log.find((entry) => entry.key === 'log.playImprovement')?.params)
      .toMatchObject({ improvements: 'Major_Joinery' })
  })

  it('offers the visible six-player Joinery copy through a Minor Improvement action', () => {
    const session = setupMinorImprovement({ playerCount: 6 }, true)
    const resp = enterMinorChoice(session)

    expect(resp.interaction.request.options?.map((option) => option.value) ?? [])
      .toContain('Major_Joinery2')
  })

  it('does not offer Furniture Stall as Joinery through a Minor Improvement action', () => {
    const session = setupMinorImprovement({
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    }, true)
    const resp = enterMinorChoice(session)

    expect(resp.interaction.request.options?.map((option) => option.value) ?? [])
      .not.toContain('Major_Moor_FurnitureStall')
  })

  it('trade-applied listener sets usedJoinery on Major_Joinery sourceId', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.roundPhase = 'harvest'
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBeUndefined()
    dispatchTradeAppliedListener(
      state,
      player,
      { from: { wood: 1 }, to: { food: 2 }, sourceId: 'Major_Joinery' },
      1,
    )
    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBe(true)
  })

  it.each([
    ['Major_Fireplace1'],
    ['Major_Moor_FurnitureStall'],
    ['Major_JoineryDeluxe'],
  ])('trade-applied listener ignores sources without Joinery identity: %s', (sourceId) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.roundPhase = 'harvest'
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    dispatchTradeAppliedListener(
      state,
      player,
      { from: { wood: 1 }, to: { food: 2 }, sourceId },
      1,
    )
    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBeFalsy()
  })

  it('trade-applied listener accepts the six-player Joinery copy', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.roundPhase = 'harvest'
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    dispatchTradeAppliedListener(
      state,
      player,
      { from: { wood: 1 }, to: { food: 2 }, sourceId: 'Major_Joinery2' },
      1,
    )
    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBe(true)
  })

  it('onAfterHarvest clears both the per-use flag and usedJoinery', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.roundPhase = 'harvest'
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    setCardFlag(player, CARD_ID, true)
    writeCardExtraData(player, CARD_ID, 'usedJoinery', true)
    session.loadState(state)

    runCardEffectHook(state, player, CARD_ID, 'onAfterHarvest')
    expect(player.cardStates?.[CARD_ID]?.flagged).toBe(false)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBe(false)
  })

  it('Joinery onHarvest dispatches trade-applied → E91 sees usedJoinery', async () => {
    // Integration: build a session, give the player Major_Joinery + wood,
    // run Joinery's onHarvest hook, and confirm E91's trade-applied
    // listener flipped the usedJoinery flag without any manual setup.
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.roundPhase = 'harvest'
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.improvements.push('Major_Joinery')
    player.resources.wood = 1
    player.resources.food = 0
    session.loadState(state)

    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBeFalsy()
    runCardEffectHook(state, player, 'Major_Joinery', 'onHarvest')
    expect(player.resources.wood).toBe(0)
    expect(player.resources.food).toBe(2)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBe(true)
  })

})
