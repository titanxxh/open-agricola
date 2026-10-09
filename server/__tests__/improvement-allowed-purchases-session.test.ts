import { describe, expect, it } from 'vitest'
import type { ActionChoiceOption, GameState } from '../../shared/contract/types'
import type { SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD = '__test_allowed_purchases__'
const ALLOWED_MINOR = 'A014_CarpentersHammer'
const SECOND_ALLOWED_MINOR = 'A015_CarpentersAxe'
const OTHER_MINOR = 'A037_Bucksaw'

type Restriction = { types: string[]; allowedPurchases: string[] }

/** After Day Laborer, the test card offers an optional restricted improvement. */
const setup = (restriction: Restriction, configure: (state: GameState) => void, injectMajor?: string) => {
  const session = createWorkSession({ configure: (state) => {
    state.players[0]!.minorPlayed = [CARD]
    state.players[0]!.resources = { ...state.players[0]!.resources, wood: 0, clay: 0, reed: 0, stone: 0 }
    configure(state)
  } })
  session.withCtx(() => {
    const registry = requireActiveCardRegistry('restricted improvement')
    registry.registerListener({
      id: `${CARD}:after-day-laborer`,
      cardIds: [CARD],
      phases: ['after'],
      actions: ['place-farmer'],
      mandatory: true,
      handler: (context) => context.space?.id !== 'day-laborer' ? undefined : {
        sourceCard: CARD,
        flow: {
          type: 'leaf',
          actionId: 'improvement',
          sourceCard: CARD,
          optional: true,
          params: { ...restriction, trueAction: false },
          actionContext: { trueAction: false },
        },
      },
    })
    if (injectMajor) {
      registry.registerListener({
        id: `${CARD}:inject-candidate`,
        cardIds: [CARD],
        phases: ['computeChoiceCandidates'],
        actions: ['improvement'],
        handler: () => ({ sourceCard: CARD, extraOptions: [{ value: injectMajor, labelKey: `improvements.${injectMajor}.name`, sourceCard: CARD }] }),
      })
    }
  })
  return session
}

const options = (response: SessionResponse): ActionChoiceOption[] =>
  response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
    ? response.interaction.request.options
    : []

/** Accepts the optional prompt and returns the improvement menu that follows. */
const openMenu = (session: ReturnType<typeof setup>) => {
  let response = session.takeAction(0, 'day-laborer')
  const accept = options(response).find((option) => option.value !== '__skip__')
  if (accept) response = session.resolveChoice(0, accept.value)
  return response
}

describe('improvement allowedPurchases', () => {
  it('does not offer a restricted improvement when only other improvements are affordable', () => {
    const session = setup({ types: ['major'], allowedPurchases: ['Major_Joinery'] }, (state) => {
      state.players[0]!.resources.clay = 2
      state.availableMajorImprovements = ['Major_Fireplace1', 'Major_Joinery']
    })

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(options(response)).toEqual([])
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId).not.toBe('engine-blocked')
    expect(response.state.players[0]!.improvements).toEqual([])
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('builds the allowed major when it is affordable, ignoring other affordable majors', () => {
    const session = setup({ types: ['major'], allowedPurchases: ['Major_Joinery'] }, (state) => {
      Object.assign(state.players[0]!.resources, { clay: 2, wood: 2, stone: 2 })
      state.availableMajorImprovements = ['Major_Fireplace1', 'Major_Joinery']
    })

    // The only allowed option is settled directly after accepting the prompt.
    const response = openMenu(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toEqual(['Major_Joinery'])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, wood: 0, stone: 0 })
  })

  it('keeps minor-only hand and injected candidates within the allowed purchases', () => {
    const session = setup({ types: ['minor'], allowedPurchases: [ALLOWED_MINOR, SECOND_ALLOWED_MINOR] }, (state) => {
      state.players[0]!.minorHand = [ALLOWED_MINOR, SECOND_ALLOWED_MINOR, OTHER_MINOR]
      Object.assign(state.players[0]!.resources, { wood: 2, clay: 2 })
      state.availableMajorImprovements = ['Major_Fireplace1']
    }, 'Major_Fireplace1')

    let response = openMenu(session)
    expect(options(response).map((option) => option.value)).toEqual([ALLOWED_MINOR, SECOND_ALLOWED_MINOR])

    const before = structuredClone(response.state.players[0]!)
    const rejected = session.resolveChoice(0, OTHER_MINOR)
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.minorPlayed).toEqual(before.minorPlayed)
    expect(rejected.state.players[0]!.resources).toEqual(before.resources)

    response = session.resolveChoice(0, ALLOWED_MINOR)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(ALLOWED_MINOR)
    expect(response.state.players[0]!.minorHand).toEqual([SECOND_ALLOWED_MINOR, OTHER_MINOR])
    expect(response.state.players[0]!.improvements).toEqual([])
  })
})
