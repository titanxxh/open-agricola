import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { familySize, setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/E/E024_Ambition'
import '../../shared/cards/B/B103_FieldMerchant'
import '../../shared/cards/A/A096_TaskArtisan'
import '../../shared/cards/A/A030_BakingSheet'
import '../../shared/cards/A/A067_CornScoop'

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
  if (response.interaction.stateId !== 'wait') return response
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
    expect(merchantOptions[0]?.effectPreview?.resourcesGained).toMatchObject({ food: 1 })
    expect(merchantOptions[0]?.effectPreview?.resourcesGained?.vegetable).toBeUndefined()

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
    response = buildSession.resolveChoice(0, original.value)
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

    let response = session.continueBeforeStartOfTurn()
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
