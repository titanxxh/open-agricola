import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const COOK = 'A101_CookeryOutfitter'
const ORIENTAL = 'A060_OrientalFireplace'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Approved seam: fresh two-player Session, real purchase/return/undo, then public scores.
const setup = (configure: (state: GameState) => void = () => {}) => {
  const session = createWorkSession({ seed: 4242, configure(state) {
    state.round = 5
    const owner = state.players[0]!
    owner.occupationPlayed = [COOK]
    owner.minorHand = [ORIENTAL]
    owner.improvements = ['Major_Fireplace1']
    owner.resources.clay = 5
    owner.resources.food = 20
    configure(state)
    for (const player of state.players) {
      for (const card of player.improvements) takeMajorImprovementFromSupply(state, card)
    }
  } })
  sessions.push(session)
  return session
}

const ok = (response: SessionResponse) => {
  assert.equal(response.ok, true, response.error)
  return response
}

const bonus = (response: SessionResponse, player = 0) => {
  assert.ok(response.scores)
  return response.scores[player]!.categories
    .find(category => category.key === 'cardBonusVp')?.entries
    .find(entry => entry.type === 'bonus' && entry.cardId === COOK)?.score ?? 0
}

const options = (response: SessionResponse) => {
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
  return response.interaction.request.options
}

const buyOriental = (session: GameSession) => {
  let response = ok(session.takeAction(0, 'meeting-place'))
  const branch = options(response).find(option => option.value.startsWith('action-improvement-'))
  if (branch) response = ok(session.resolveChoice(0, branch.value))
  if (response.state.players[0]!.minorHand.includes(ORIENTAL)) {
    expect(options(response)).toContainEqual(expect.objectContaining({ value: ORIENTAL }))
    response = ok(session.resolveChoice(0, ORIENTAL))
  }
  if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = options(response).find(option => JSON.stringify(option).includes('Major_Fireplace1'))
    assert.ok(payment, 'Expected returning Fireplace payment')
    response = ok(session.resolveChoice(0, payment.value))
  }
  return response
}

describe('A101 Cookery Outfitter', () => {
  it('keeps one cooking point when a real Oriental Fireplace purchase returns a Fireplace', () => {
    const session = setup()
    expect(bonus(session.getState())).toBe(1)
    const response = buyOriental(session)
    expect(response.state.players[0]!.minorPlayed).toEqual([ORIENTAL])
    expect(response.state.players[0]!.improvements).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ food: 20, clay: 5 })
    expect(response.state.availableMajorImprovements).toContain('Major_Fireplace1')
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid', returnedCardId: 'Major_Fireplace1', sourceCardId: ORIENTAL,
    }))
    expect(bonus(response)).toBe(1)
  })

  it('undoes and retries the purchase with the same resources, card supply and cooking score', () => {
    const session = setup()
    const before = structuredClone({
      resources: session.state.players[0]!.resources,
      supply: session.state.availableMajorImprovements,
      events: session.state.events,
      log: session.state.log,
    })
    const purchased = buyOriental(session)
    expect(bonus(purchased)).toBe(1)
    const undone = ok(session.undoAction())
    expect(undone.state.players[0]!.minorHand).toEqual([ORIENTAL])
    expect(undone.state.players[0]!.minorPlayed).toEqual([])
    expect(undone.state.players[0]!.improvements).toEqual(['Major_Fireplace1'])
    expect(undone.state.players[0]!.resources).toEqual(before.resources)
    expect(undone.state.availableMajorImprovements).toEqual(before.supply)
    expect(undone.state.events).toEqual(before.events)
    expect(undone.state.log).toEqual(before.log)
    expect(bonus(undone)).toBe(1)
    const retry = buyOriental(session)
    expect(bonus(retry)).toBe(1)
    expect(retry.state.players[0]!.minorPlayed).toEqual([ORIENTAL])
  })

  it('counts a dual-identity cooking minor once alongside a cooking major and excludes an oven', () => {
    const session = setup(state => {
      state.players[0]!.minorPlayed = [ORIENTAL]
      state.players[0]!.minorHand = ['__test_placeholder__']
      state.players[0]!.improvements = ['Major_CookingHearth1', 'Major_ClayOven']
    })
    const before = session.getState()
    expect(bonus(before)).toBe(2)
    for (let read = 0; read < 3; read++) {
      const response = session.getState()
      expect(bonus(response)).toBe(2)
      expect(response.state).toEqual(before.state)
      expect(response.interaction).toEqual(before.interaction)
    }
  })

  it('counts separate physical cooking majors independently', () => {
    const session = setup(state => {
      state.players[0]!.improvements = [
        'Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1', 'Major_CookingHearth2',
      ]
    })
    expect(bonus(session.getState())).toBe(4)
  })

  it('does not count ovens, held cards or another player\'s cooking cards', () => {
    const session = setup(state => {
      state.players[0]!.improvements = ['Major_ClayOven', 'Major_StoneOven']
      state.players[1]!.minorPlayed = [ORIENTAL]
      state.players[1]!.improvements = ['Major_CookingHearth1']
    })
    expect(bonus(session.getState())).toBe(0)
  })

  it('awards no cooking bonus before Cookery Outfitter has been played', () => {
    const session = setup(state => {
      state.players[0]!.occupationPlayed = []
      state.players[0]!.occupationHand = [COOK]
      state.players[0]!.minorPlayed = [ORIENTAL]
    })
    expect(bonus(session.getState())).toBe(0)
  })
})
