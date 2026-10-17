import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { familySize, setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/E/E024_Ambition'
import '../../shared/cards/B/B103_FieldMerchant'
import '../../shared/cards/A/A096_TaskArtisan'
import '../../shared/cards/A/A030_BakingSheet'
import '../../shared/cards/A/A067_CornScoop'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit32Baking from './_helpers/audit/ae-negative-32-baking'

const AMBITION = 'E024_Ambition'
const FIELD_MERCHANT = 'B103_FieldMerchant'
const TASK_ARTISAN = 'A096_TaskArtisan'
const MINOR = 'A030_BakingSheet'
const OTHER_MINOR = 'A067_CornScoop'
const PLACEHOLDER = '__test_placeholder__'
const OCCUPATIONS = ['__test_occupation_1__', '__test_occupation_2__']

const setup = (options: {
  ambition?: 'hand' | 'played' | 'absent'
  occupations?: number
  fieldMerchant?: boolean
  taskArtisan?: boolean
  withMinor?: boolean
  round?: number
  rooms?: number
} = {}) => {
  const session = new GameSession(24, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = options.round ?? 5
  state.roundPhase = 'work'

  for (const entry of state.players) {
    entry.minorHand = [PLACEHOLDER]
    entry.occupationHand = [PLACEHOLDER]
    setWorkersAtHome(state, entry, 2)
  }

  const player = state.players[0]!
  const ambition = options.ambition ?? 'played'
  player.minorHand = ambition === 'hand'
    ? [AMBITION, ...(options.withMinor ? [MINOR, OTHER_MINOR] : [])]
    : options.withMinor ? [MINOR, OTHER_MINOR] : [PLACEHOLDER]
  player.minorPlayed = ambition === 'played' ? [AMBITION] : []
  player.occupationPlayed = OCCUPATIONS.slice(0, options.occupations ?? 2)
  if (options.fieldMerchant) player.occupationPlayed.push(FIELD_MERCHANT)
  if (options.taskArtisan) player.occupationPlayed.push(TASK_ARTISAN)
  player.rooms = options.rooms ?? 2
  Object.assign(player.resources, {
    wood: 10,
    clay: 10,
    reed: 10,
    stone: 10,
    food: 20,
    grain: 0,
    vegetable: 0,
  })

  session.loadState(state)
  return session
}

const enterOptionalImprovement = (session: GameSession, response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.promptKey === 'ui.interactionSelectReplacement') return response
  const enter = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(enter).toBeDefined()
  return enter ? session.resolveChoice(response.interaction.playerIndex, enter.value) : response
}

const enterMeetingPlaceImprovement = (session: GameSession) =>
  enterOptionalImprovement(session, session.takeAction(0, 'meeting-place'))

const buildPottery = (session: GameSession, response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.options?.map((option) => option.value)).toContain('Major_Pottery')
  return session.resolveChoice(response.interaction.playerIndex, 'Major_Pottery')
}

describe('E024 Ambition parity', () => {
  it('E024 S1: exactly two occupations allow Ambition to be played for no resources', () => {
    const session = setup({ ambition: 'hand' })
    const before = { ...session.state.players[0]!.resources }
    const response = enterMeetingPlaceImprovement(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(AMBITION)
    expect(response.state.players[0]!.resources).toMatchObject(before)
  })

  it('E024 S2: one occupation keeps Ambition unavailable', () => {
    const session = setup({ ambition: 'hand', occupations: 1 })
    const response = session.takeAction(0, 'meeting-place')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorHand).toContain(AMBITION)
    expect(response.state.players[0]!.minorPlayed).not.toContain(AMBITION)
  })

  it('E024 S3: a Meeting Place Minor Improvement action can build Pottery instead', () => {
    const session = setup()

    const response = buildPottery(session, enterMeetingPlaceImprovement(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Pottery')
    expect(response.state.availableMajorImprovements).not.toContain('Major_Pottery')
    expect(response.state.players[0]!.resources.clay).toBe(8)
    expect(response.state.players[0]!.resources.stone).toBe(8)
  })

  it('E024 S4: the Minor Improvement action after Family Growth can build Pottery instead', () => {
    const session = setup({ round: 2, rooms: 3 })
    const familyBefore = familySize(session.state.players[0]!)

    const response = buildPottery(
      session,
      enterOptionalImprovement(session, session.takeAction(0, 'wish-children')),
    )

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(familyBefore + 1)
    expect(response.state.players[0]!.improvements).toContain('Major_Pottery')
  })

  it('E024 S5: Field Merchant treats an Ambition-upgraded action only as a declined minor', () => {
    const declinedSession = setup({ fieldMerchant: true })
    let response = enterMeetingPlaceImprovement(declinedSession)

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const merchantOptions = response.interaction.request.options
      ?.filter((option) => option.sourceCard === FIELD_MERCHANT) ?? []
    expect(merchantOptions).toHaveLength(1)

    response = declinedSession.resolveChoice(0, merchantOptions[0]!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)

    const buildSession = setup({ fieldMerchant: true })
    response = enterMeetingPlaceImprovement(buildSession)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const original = response.interaction.request.options?.find((option) => !option.sourceCard)
    expect(original).toBeDefined()
    if (!original) return
    response = enterOptionalImprovement(buildSession, buildSession.resolveChoice(0, original.value))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.options?.map((option) => option.value)).toContain('Major_Pottery')
  })

  it('E024 S6: Ambition does not extend Task Artisan card-derived Minor Improvement actions', () => {
    const session = setup({ taskArtisan: true, withMinor: true, round: 5 })
    const state = session.getState().state
    state.roundPhase = 'preparation'
    state.roundActionOrder[4] = 'western-quarry'
    session.loadState(state)

    let response = session.withCtx(() => session.continueBeforeStartOfTurn())
    response = resolveTriggerIfPresent(session, response, TASK_ARTISAN)
    expect(response.state.players[0]!.resources.wood).toBe(11)
    response = enterOptionalImprovement(session, response)

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const choices = response.interaction.request.options?.map((option) => option.value) ?? []
    expect(choices).toContain(MINOR)
    expect(choices.some((choice) => choice.startsWith('Major_'))).toBe(false)
  })

  it('E024 S7: without Ambition a Meeting Place Minor Improvement action offers no major', () => {
    const session = setup({ ambition: 'absent', withMinor: true })

    const response = enterMeetingPlaceImprovement(session)

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const choices = response.interaction.request.options?.map((option) => option.value) ?? []
    expect(choices).toContain(MINOR)
    expect(choices.some((choice) => choice.startsWith('Major_'))).toBe(false)
  })
})

describe('ae-negative-32-baking', () => {
  const { sessions, save, ok, make, choose, finish, buy, OCC, ambition, major } = audit32Baking
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E024 N1 actual prerequisite purchase and Meeting Place substitution build one major at its full clay cost while retaining the source action space', () => { const s = ambition(false), bought = finish(s, buy(s, 'E024_Ambition')); assert.ok(bought.state.players[0]!.minorPlayed.includes('E024_Ambition')); const t = ambition(), r = major(t); assert.deepEqual([r.state.players[0]!.resources.clay, r.state.players[0]!.improvements.includes('Major_Fireplace1')], [0, true]); assert.equal(r.state.actionSpaces.find(a => a.id === 'meeting-place')!.takenBy.length, 1); assert.equal(r.state.actionSpaces.find(a => a.id === 'major-improvement')!.takenBy.length, 0); save('E024-N1', { bought, r }); });
  it('E024 N2 real Family Growth minor followup can substitute one major without also playing a minor', () => { const s = ambition(true, 2, 2, true), r = major(s, 'wish-children'); assert.equal(r.state.players[0]!.improvements.includes('Major_Fireplace1'), true); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(r.state.players[0]!.workers.filter(w => w.isActive).length, 3); assert.deepEqual(r.state.players[0]!.minorPlayed, ['E024_Ambition']); save('E024-N2', r); });
  it('E024 N3 one occupation cannot buy while a held Ambition and insufficient clay cannot build a free major', () => { const s = ambition(false, 1), poor = buy(s, 'E024_Ambition'); assert.ok(poor.state.players[0]!.minorHand.includes('E024_Ambition')); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E024_Ambition')); const rows = []; for (const [played, clay] of [[false, 2], [true, 1]] as const) {
      const t = ambition(played, 2, clay);
      let p = ok(t.takeAction(0, 'meeting-place'));
      if (p.interaction.stateId === 'wait' && p.interaction.request.kind === 'choice' && p.interaction.request.options.some(o => o.value.startsWith('action-improvement-')))
          p = choose(t, p, o => o.value.startsWith('action-improvement-'));
      assert.equal(p.state.players[0]!.minorPlayed.includes('E024_Ambition'), played);
      const bad = assertRejectedUnchanged(t, () => t.resolveChoice(0, 'Major_Fireplace1'));
      assert.equal(bad.state.players[0]!.improvements.includes('Major_Fireplace1'), false);
      assert.equal(bad.state.players[0]!.resources.clay, clay);
      rows.push({ p, bad });
  } save('E024-N3', { poor, rows }); });
  it('E024 N4 Ambition preserves the normal minor option and wrong actor cannot buy the major before legal retry', () => { const s = ambition(), p = ok(s.takeAction(0, 'meeting-place')); let selection = p; if (selection.interaction.stateId === 'wait' && selection.interaction.request.kind === 'choice' && selection.interaction.request.options.some(o => o.value.startsWith('action-improvement-')))
      selection = choose(s, selection, o => o.value.startsWith('action-improvement-')); const wrong = assertRejectedUnchanged(s, () => s.resolveChoice(1, 'Major_Fireplace1')), r = finish(s, ok(s.resolveChoice(0, 'Major_Fireplace1'))); assert.equal(r.state.players[0]!.resources.clay, 0); const t = make('E024_Ambition', true, state => { state.players[0]!.occupationPlayed = OCC.slice(0, 2); state.players[0]!.minorHand = ['C016_FieldFences']; state.players[0]!.resources.food = 2; }), minor = finish(t, buy(t, 'C016_FieldFences')); assert.ok(minor.state.players[0]!.minorPlayed.includes('C016_FieldFences')); save('E024-N4', { p, selection, wrong, r, minor }); });
  it('E024 N5 an otherwise unplayable minor must not hide an affordable major substituted on Meeting Place', () => {
      const s = make('E024_Ambition', true, state => {
          state.availableMajorImprovements = ['Major_Fireplace1'];
          state.players[0]!.occupationPlayed = OCC.slice(0, 2);
          state.players[0]!.resources.clay = 2;
          state.players[0]!.minorHand = ['C017_NewlyPlowedField'];
      });
      const p = ok(s.takeAction(0, 'meeting-place'));
      const menu = choose(s, p, o => o.value.startsWith('action-improvement-'));
      const hasMajor = menu.interaction.stateId === 'wait' && menu.interaction.request.kind === 'choice'
          && menu.interaction.request.options.some(o => o.value === 'Major_Fireplace1' && !('disabled' in o && o.disabled));
      const r = hasMajor ? finish(s, ok(s.resolveChoice(0, 'Major_Fireplace1'))) : menu;
      assert.deepEqual(r.state.players[0]!.minorHand, ['C017_NewlyPlowedField']);
      save('E024-N5', { p, menu, r });
      assert.deepEqual([r.state.players[0]!.improvements.includes('Major_Fireplace1'), r.state.players[0]!.resources.clay], [true, 0]);
  });
})
