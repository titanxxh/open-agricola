import { describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
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
    state.players[0]!.resources = { ...state.players[0]!.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0 }
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

const waiting = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? {
      kind: response.interaction.request.kind,
      playerIndex: response.interaction.playerIndex,
      options: response.interaction.request.kind === 'choice'
        ? response.interaction.request.options.map((option) => option.value)
        : undefined,
    }
  : { kind: response.interaction.stateId }

const logs = (response: SessionResponse, key: string) => response.state.log.filter((entry) => entry.key === key)

const cardPoints = (response: SessionResponse) => response.scores
  ?.find((score) => score.playerId === response.state.players[0]!.id)
  ?.categories.find((category) => category.key === 'cards')?.total ?? 0

describe('improvement allowedPurchases', () => {
  it('does not offer a restricted improvement when only other improvements are affordable', () => {
    const session = setup({ types: ['major'], allowedPurchases: ['Major_Joinery'] }, (state) => {
      state.players[0]!.resources.clay = 2
      state.availableMajorImprovements = ['Major_Fireplace1', 'Major_Joinery']
    })

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    // The turn ends normally instead of offering (and then blocking on) the purchase.
    expect(waiting(response)).toEqual({ kind: 'confirm-next-player', playerIndex: 0, options: undefined })
    expect(response.state.players[0]!.improvements).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, food: 2 })
    expect(logs(response, 'log.placeFarmer')).toHaveLength(1)
    expect(logs(response, 'log.improvementFail')).toEqual([])
    expect(logs(response, 'log.playImprovement')).toEqual([])
    expect(cardPoints(response)).toBe(0)
  })

  it('builds the allowed major when it is affordable, ignoring other affordable majors', () => {
    const session = setup({ types: ['major'], allowedPurchases: ['Major_Joinery'] }, (state) => {
      Object.assign(state.players[0]!.resources, { clay: 2, wood: 2, stone: 2 })
      state.availableMajorImprovements = ['Major_Fireplace1', 'Major_Joinery']
    })

    let response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(waiting(response)).toEqual({ kind: 'choice', playerIndex: 0, options: ['flow-0', '__skip__'] })
    expect(response.state.players[0]!.improvements).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, wood: 2, stone: 2, food: 2 })
    expect(logs(response, 'log.placeFarmer')).toHaveLength(1)
    expect(logs(response, 'log.playImprovement')).toEqual([])
    expect(cardPoints(response)).toBe(0)

    // Accepting settles the only allowed improvement directly.
    response = session.resolveChoice(0, 'flow-0')

    expect(response.ok, response.error).toBe(true)
    expect(waiting(response)).toEqual({ kind: 'confirm-next-player', playerIndex: 0, options: undefined })
    expect(response.state.players[0]!.improvements).toEqual(['Major_Joinery'])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, wood: 0, stone: 0, food: 2 })
    expect(logs(response, 'log.cardGrantedAction')).toEqual([expect.objectContaining({ params: expect.objectContaining({ cardId: CARD }) })])
    expect(logs(response, 'log.playImprovement')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ improvements: 'Major_Joinery', costResources: { wood: 2, stone: 2 } }) }),
    ])
    expect(cardPoints(response)).toBe(2)
  })

  it('keeps minor-only hand and injected candidates within the allowed purchases', () => {
    const session = setup({ types: ['minor'], allowedPurchases: [ALLOWED_MINOR, SECOND_ALLOWED_MINOR] }, (state) => {
      state.players[0]!.minorHand = [ALLOWED_MINOR, SECOND_ALLOWED_MINOR, OTHER_MINOR]
      Object.assign(state.players[0]!.resources, { wood: 2, clay: 2 })
      state.availableMajorImprovements = ['Major_Fireplace1']
    }, 'Major_Fireplace1')

    let response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(waiting(response)).toEqual({ kind: 'choice', playerIndex: 0, options: ['flow-0', '__skip__'] })
    expect(response.state.players[0]!.minorPlayed).toEqual([CARD])
    expect(logs(response, 'log.placeFarmer')).toHaveLength(1)
    expect(cardPoints(response)).toBe(0)

    response = session.resolveChoice(0, 'flow-0')

    expect(response.ok, response.error).toBe(true)
    // Neither the other hand minor nor the injected major is offered.
    expect(waiting(response)).toEqual({ kind: 'choice', playerIndex: 0, options: [ALLOWED_MINOR, SECOND_ALLOWED_MINOR] })
    expect(response.state.players[0]!.minorHand).toEqual([ALLOWED_MINOR, SECOND_ALLOWED_MINOR, OTHER_MINOR])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 2, food: 2 })
    expect(logs(response, 'log.cardGrantedAction')).toHaveLength(1)
    expect(logs(response, 'log.playMinorImprovement')).toEqual([])
    expect(cardPoints(response)).toBe(0)

    const rejected = session.resolveChoice(0, OTHER_MINOR)

    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('invalid choice value')
    expect(waiting(rejected)).toEqual({ kind: 'choice', playerIndex: 0, options: [ALLOWED_MINOR, SECOND_ALLOWED_MINOR] })
    expect(rejected.state.players[0]!.minorHand).toEqual([ALLOWED_MINOR, SECOND_ALLOWED_MINOR, OTHER_MINOR])
    expect(rejected.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 2, food: 2 })
    expect(logs(rejected, 'log.playMinorImprovement')).toEqual([])
    expect(cardPoints(rejected)).toBe(0)

    response = session.resolveChoice(0, ALLOWED_MINOR)

    expect(response.ok, response.error).toBe(true)
    expect(waiting(response)).toEqual({ kind: 'confirm-next-player', playerIndex: 0, options: undefined })
    expect(response.state.players[0]!.minorPlayed).toEqual([CARD, ALLOWED_MINOR])
    expect(response.state.players[0]!.minorHand).toEqual([SECOND_ALLOWED_MINOR, OTHER_MINOR])
    expect(response.state.players[0]!.improvements).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 2, food: 2 })
    expect(logs(response, 'log.playMinorImprovement')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ improvements: ALLOWED_MINOR, costResources: { wood: 1 } }) }),
    ])
    expect(cardPoints(response)).toBe(0)
  })
})
