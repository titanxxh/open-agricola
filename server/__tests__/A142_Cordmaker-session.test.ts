import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import assert from 'node:assert/strict'
import { descriptionEffects } from './_helpers/choice-description'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, confirmNext, undoRuleSnapshot, assertUndoRestored, getChoiceOptions } from './_helpers/session-assertions'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A142_Cordmaker'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A142_Cordmaker'
const FILLER = '__test_placeholder__'

const setup = ({ reed = 2, actor = 0, food = 0, played = true } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5142, options: { playerCount: 3 } }))
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 0
    player.resources.reed = 0
    player.resources.grain = 0
    player.resources.vegetable = 0
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.food = food
  const reedBank = state.actionSpaces.find((space) => space.id === 'reed-bank')
  if (!reedBank) throw new Error('reed-bank missing')
  reedBank.resources.reed = reed
  reedBank.takenBy = []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response).find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const enterCordmakerChoice = (session: GameSession, response: SessionResponse) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  while (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch') {
    response = confirmPlayerSwitch(session)
  }
  return response
}

const chooseReward = (
  session: GameSession,
  response: SessionResponse,
  resource: 'grain' | 'vegetable',
) => {
  response = enterCordmakerChoice(session, response)
  for (let step = 0; step < 4; step++) {
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind === 'confirm-next-player') return response
    const interaction = response.interaction
    assert.equal(interaction.sourceCard, CARD_ID)
    assert.equal(interaction.playerIndex, 0)
    assert.ok(interaction.request.kind === 'choice', JSON.stringify(interaction))
    const reward = interaction.request.options.find(option => !option.disabled
      && [option.effectPreview, ...descriptionEffects(option.descriptionPreview)].some(effect =>
        effect?.kind === 'resourceExchange' && effect.resourcesGained?.[resource] === 1))
    assert.ok(reward, JSON.stringify(interaction))
    response = session.resolveChoice(0, reward.value)
    sessionEvidence.record('crop continuation', response)
    assert.equal(response.ok, true, response.error)
    response = enterCordmakerChoice(session, response)
  }
  assert.fail('Cordmaker reward did not finish after four crop choices')
}

describe('A142 Cordmaker parity', () => {
  it('A142 S1: Cordmaker is played as the first occupation without paying food in a three-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A142 S2: owner taking at least two reed must choose and can gain one grain', () => {
    const session = setup()
    const response = session.takeAction(0, 'reed-bank')

    expect(response.state.players[0]!.resources).toMatchObject({ reed: 2, grain: 1, vegetable: 0 })
  })

  it('A142 S3: owner taking at least two reed can buy one vegetable for two food', () => {
    const session = setup({ food: 2 })
    const response = chooseReward(session, session.takeAction(0, 'reed-bank'), 'vegetable')

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 1, grain: 0 })
  })

  it('A142 S4: without two food the owner can only choose grain', () => {
    const session = setup({ food: 1 })
    const response = enterCordmakerChoice(session, session.takeAction(0, 'reed-bank'))

    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, grain: 1, vegetable: 0 })
  })

  it('A142 S5: an opponent taking at least two reed lets the owner gain one grain', () => {
    const session = setup({ actor: 1 })
    const response = chooseReward(session, session.takeAction(1, 'reed-bank'), 'grain')

    expect(response.state.players[1]!.resources.reed).toBe(2)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('A142 S6: the owner can decline the reward triggered by an opponent', () => {
    const session = setup({ actor: 1, food: 2 })
    let response = enterCordmakerChoice(session, session.takeAction(1, 'reed-bank'))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 0, vegetable: 0 })
  })

  it('A142 S7: taking fewer than two reed does not trigger Cordmaker', () => {
    const response = setup({ reed: 1 }).takeAction(0, 'reed-bank')

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('A142 S8: taking resources from another accumulation space does not trigger Cordmaker', () => {
    const session = setup()
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 2
    session.loadState(state)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})

describe('A142 command boundaries', () => {
  const turn = (session: GameSession, actor: number, space: string) => {
    let response = session.getState()
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-next-player')
      response = confirmNext(session, response)
    assert.equal(response.interaction.stateId, 'idle')
    assert.equal(response.state.currentPlayerIndex, actor)
    const result = session.takeAction(actor, space)
    assert.equal(result.ok, true, result.error)
    return result
  }
  it('own Reed Bank two or three gives one grain or paid vegetable exactly once', () => {
    for (const [reed, crop, grain, vegetable, food] of [
      [2, 'grain', 1, 0, 2], [3, 'grain', 1, 0, 2],
      [2, 'vegetable', 0, 1, 0], [3, 'vegetable', 0, 1, 0],
    ] as const) {
      const session = setup({ reed, food: 2 })
      const response = chooseReward(session, turn(session, 0, 'reed-bank'), crop)
      expect(response.state.players[0]!.resources).toMatchObject({ reed, grain, vegetable, food })
      assert.ok(response.interaction.stateId === 'wait'
        && response.interaction.request.kind === 'confirm-next-player')
    }
  })
  it('Reed Bank zero or one and hand cannot trigger crop reward', () => {
    const empty = setup({ reed: 0, food: 40 })
    assertEmptyAccumulationRejected(empty, 0, 'reed-bank')
    for (const params of [{ reed: 1, food: 40 }, { reed: 3, food: 40, played: false }]) {
      const session = setup(params)
      const response = turn(session, 0, 'reed-bank')
      expect(response.state.players[0]!.resources).toMatchObject({ reed: params.reed, grain: 0, vegetable: 0, food: 40 })
      assert.ok(response.interaction.stateId === 'wait'
        && response.interaction.request.kind === 'confirm-next-player')
    }
  })
  it('actual opponent Reed Bank rewards only owner and decline keeps crops', () => {
    for (const [crop, grain, vegetable, food] of [
      ['grain', 1, 0, 4], ['vegetable', 0, 1, 2], [null, 0, 0, 4],
    ] as const) {
      const session = setup({ food: 2 })
      turn(session, 0, 'day-laborer')
      let response = enterCordmakerChoice(session, turn(session, 1, 'reed-bank'))
      assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
      assert.equal(response.interaction.playerIndex, 0)
      assert.equal(response.interaction.sourceCard, CARD_ID)
      if (crop)
        response = chooseReward(session, response, crop)
      else {
        const decline = getChoiceOptions(response).find(option => option.value === '__skip__')
        assert.ok(decline && !decline.disabled)
        response = session.resolveChoice(0, decline.value)
        assert.equal(response.ok, true, response.error)
      }
      expect(response.state.players[1]!.resources).toMatchObject({ reed: 2, grain: 0, vegetable: 0, food: 0 })
      expect(response.state.players[0]!.resources).toMatchObject({ grain, vegetable, food })
    }
  })
  it('one food cannot buy vegetable and invalid actor or crop cannot produce free reward', () => {
    const session = setup({ food: 1 })
    const response = turn(session, 0, 'reed-bank')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, reed: 2, grain: 1, vegetable: 0 })
    assert.ok(response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-next-player')
    assertRejectedUnchanged(session, () => session.resolveChoice(1, 'vegetable'))
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'unpaid-vegetable'))
  })
  it('whole own action undo restores payment crop and Reed Bank before retry', () => {
    const session = setup({ food: 2 })
    const before = undoRuleSnapshot(session.getState())
    const first = chooseReward(session, turn(session, 0, 'reed-bank'), 'vegetable')
    expect(first.state.players[0]!.resources).toMatchObject({ food: 0, reed: 2, vegetable: 1 })
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'vegetable'))
    const undone = session.undoAction()
    assertUndoRestored(before, undone)
    assertUndoRestored(before, session.getState())
    const retry = chooseReward(session, turn(session, 0, 'reed-bank'), 'grain')
    expect(retry.state.players[0]!.resources).toMatchObject({ food: 2, reed: 2, grain: 1, vegetable: 0 })
  })
})
