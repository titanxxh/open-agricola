import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/E/E028_Bookmark'
import '../../shared/cards/A/A097_Freshman'

const CARD_ID = 'E028_Bookmark'
const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const setup = (round = 3, hand = true) => {
  const session = createWorkSession({ seed: 6028, configure: state => {
    state.round = round
    state.players.forEach(player => { player.resources.food = 20 })
    const player = state.players[0]!
    player.resources.wood = 1
    player.minorHand = [CARD_ID]
    player.occupationHand = hand ? ['A097_Freshman'] : ['__test_placeholder__']
  } })
  sessions.push(session)
  let response = session.takeAction(0, 'meeting-place')
  if (!response.state.players[0]!.minorPlayed.includes(CARD_ID) && response.interaction.stateId === 'wait') {
    const option = response.interaction.request.options?.find(option => option.value !== '__skip__')
    if (option) response = session.resolveChoice(0, option.value)
  }
  if (!response.state.players[0]!.minorPlayed.includes(CARD_ID) && response.interaction.stateId === 'wait') response = session.resolveChoice(0, CARD_ID)
  expect(response.ok).toBe(true)
  expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  return session
}
const mature = (session: ReturnType<typeof setup>, round = 5) => {
  const state = session.getState().state
  state.round = round
  state.players.forEach(player => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

describe('Bookmark uses its executable timed rule', () => {
  it.each(['accept', 'decline'] as const)('offers the free occupation at the exact preparation phase: %s', decision => {
    const session = setup()
    const response = session.getState()
    expect(readCardExtraData(response.state.players[0]!, CARD_ID, 'triggerRound')).toBe(6)
    const publicState = session.buildSyncPayload(response, null).state
    expect(publicState.players[0]!.scheduledEffects).toMatchObject([{ round: 6, sourceCard: CARD_ID, timing: 'onRoundStart', description: { optional: true, labelKey: 'actions.lessons.name', effectPreview: { kind: 'payment', resourcesPaid: {} } } }])
    const before = JSON.stringify(session.state)
    session.buildSyncPayload(session.getState(), null)
    expect(JSON.stringify(session.state)).toBe(before)
    let due = mature(session)
    expect(due.ok).toBe(true)
    if (due.interaction.stateId !== 'wait') throw new Error('Missing Bookmark choice')
    if (decision === 'decline') {
      const skip = due.interaction.request.options?.find(option => ['__skip__', '__pass__'].includes(option.value))
      if (!skip) throw new Error('Missing Bookmark decline')
      due = session.resolveChoice(0, skip.value)
    } else {
      for (let step = 0; step < 5 && !due.state.players[0]!.occupationPlayed.includes('A097_Freshman'); step += 1) {
        if (due.interaction.stateId !== 'wait') throw new Error('Missing Bookmark occupation choice')
        const option = due.interaction.request.options?.find(option => option.value === 'A097_Freshman')
          ?? due.interaction.request.options?.find(option => !option.disabled
            && !['__skip__', '__pass__', '__done__'].includes(option.value) && option.labelKey !== 'actions.exchange.name')
        if (!option) throw new Error('Missing Bookmark branch')
        due = session.resolveChoice(0, option.value)
        expect(due.ok, due.error).toBe(true)
      }
    }
    expect(due.ok).toBe(true)
    expect(due.state.players[0]!.occupationPlayed.includes('A097_Freshman')).toBe(decision === 'accept')
    expect(due.state.players[0]!.resources.food).toBe(20)
    expect(session.buildSyncPayload(due, null).state.players[0]!.scheduledEffects).toEqual([])
    expect(readCardExtraData(due.state.players[0]!, CARD_ID, 'timedRuleReceipts')).toEqual(['free-occupation:6'])
  })

  it('consumes the opportunity without offering an unavailable occupation', () => {
    const session = setup(3, false)
    const due = mature(session)
    expect(due.ok).toBe(true)
    expect(due.state.players[0]!.occupationPlayed).toEqual([])
    expect(session.buildSyncPayload(due, null).state.players[0]!.scheduledEffects).toEqual([])
  })

  it('does not move a target beyond round fourteen to the last round', () => {
    const session = setup(13)
    expect(readCardExtraData(session.state.players[0]!, CARD_ID, 'triggerRound')).toBe(16)
    expect(session.buildSyncPayload(session.getState(), null).state.players[0]!.scheduledEffects).toEqual([])
    expect(mature(session, 13).state.players[0]!.occupationPlayed).toEqual([])
  })
})
