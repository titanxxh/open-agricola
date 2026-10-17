import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/E/E028_Bookmark'
import '../../shared/cards/A/A097_Freshman'
import assert from 'node:assert/strict'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'

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

describe('ae-negative-33-native', () => {
  const { sessions, traces, save, make, fill, reach, end, final, purchase, rejectBuy, resource, occupations } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("E028 N1 real purchase marks plus three and natural due preparation plays one occupation for no fee", () => { const s = make('E028_Bookmark', st => { st.players[0]!.resources.wood = 1; st.players[0]!.resources.food = 20; occupations(st.players[0]!, 1); }, false, 2), bought = purchase(s, 'E028_Bookmark'); assert.equal(bought.state.players[0]!.cardStates.E028_Bookmark?.extraData?.triggerRound, 5); resource(bought, { wood: 0 }); const three = reach(s, 3), four = reach(s, 4); assert.equal(three.state.players[0]!.occupationPlayed.includes('A125_Priest'), false); assert.equal(four.state.players[0]!.occupationPlayed.includes('A125_Priest'), false); const due = reach(s, 5, true, ['A125_Priest']); assert.ok(due.state.players[0]!.occupationPlayed.includes('A125_Priest')); assert.ok(due.state.players[0]!.occupationHand.includes('A103_Portmonger')); resource(due, { food: 16 }); save('E028-N1', { bought, three, four, due }); });
  it("E028 N2 due decline no playable occupation and out-of-range late purchase cannot play free occupations", () => { for (const empty of [false, true]) {
      const s = make('E028_Bookmark', st => { st.players[0]!.resources.wood = 1; if (empty)
          st.players[0]!.occupationHand = ['__test_placeholder__']; }, false, 2), bought = purchase(s, 'E028_Bookmark'), due = reach(s, 5, empty);
      assert.equal(due.state.players[0]!.occupationPlayed.length, 0);
      const next = reach(s, 6, true);
      assert.equal(next.state.players[0]!.occupationPlayed.length, 0);
      save(`E028-N2-${empty}`, { bought, due, next });
  } const s = make('E028_Bookmark', st => { st.players[0]!.resources.wood = 1; }, false, 13), bought = purchase(s, 'E028_Bookmark'), r = final(s); assert.equal(bought.state.players[0]!.cardStates.E028_Bookmark?.extraData?.triggerRound, 16); assert.equal(r.state.players[0]!.occupationPlayed.length, 0); save('E028-N2-late', { bought, r }); });
  it("E028 N3 missing wood actual rejection hand-only round preparation and ordinary midround work do not grant an early play", () => { const b = make('E028_Bookmark', undefined, false); save('E028-N3-short', rejectBuy(b, 'E028_Bookmark')); const h = make('E028_Bookmark', undefined, false, 4), held = end(h, true, [], 'E028_Bookmark'); assert.equal(held.state.players[0]!.occupationPlayed.length, 0); const s = make('E028_Bookmark', st => { st.players[0]!.resources.wood = 1; }, false, 2), bought = purchase(s, 'E028_Bookmark'); fill(s); const mid = fill(s); assert.equal(mid.state.players[0]!.occupationPlayed.length, 0); save('E028-N3', { held, bought, mid }); });
})
