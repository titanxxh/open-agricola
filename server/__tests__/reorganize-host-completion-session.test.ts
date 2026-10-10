import { describe, expect, it } from 'vitest'
import type { ActionFlow } from '../../shared/contract/types'
import type { CardListenerContext, CardListenerRegistration } from '../../shared/cards/card-listeners'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD = '__test_reorganize_host__'
const SHEEP_IN_HOUSE = { zones: [{ id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 }] }

type Reaction = { actionId: string; phase: string; sourceCard?: string; space?: string; result?: string }

/** Records every listener phase of `actionId` for the test card's owner. */
const recordPhases = (actionId: string, reactions: Reaction[]): CardListenerRegistration[] =>
  (['before', 'immediatelyAfter', 'after'] as const).map((phase) => ({
    id: `${CARD}:${actionId}:${phase}`,
    cardIds: [CARD],
    phases: [phase],
    actions: [actionId],
    handler: (context: CardListenerContext) => {
      reactions.push({ actionId, phase, sourceCard: context.sourceCard, space: context.space?.id, result: context.result?.type })
      return undefined
    },
  }))

/** After Day Laborer, the test card grants `grant`; reorganize phases are recorded. */
const setupGrant = (grant: ActionFlow, sheep = 1) => {
  const session = createWorkSession({ configure: (state) => {
    const player = state.players[0]!
    player.minorPlayed = [CARD]
    player.resources = { ...player.resources, sheep, wood: 0 }
  } })
  const reactions: Reaction[] = []
  session.withCtx(() => {
    const registry = requireActiveCardRegistry('reorganize host completion')
    registry.registerListener({
      id: `${CARD}:grant`, cardIds: [CARD], phases: ['after'], actions: ['place-farmer'], mandatory: true,
      handler: (context) => context.space?.id === 'day-laborer' ? { sourceCard: CARD, flow: grant } : undefined,
    })
    recordPhases('reorganize', reactions).forEach((registration) => registry.registerListener(registration))
  })
  return { session, reactions }
}

const waiting = (r: SessionResponse) => r.interaction.stateId === 'wait'
  ? { kind: r.interaction.request.kind, playerIndex: r.interaction.playerIndex }
  : { kind: r.interaction.stateId }
const choiceOptions = (r: SessionResponse) =>
  r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' ? r.interaction.request.options : []
const logs = (r: SessionResponse, key: string) => r.state.log.filter((entry) => entry.key === key)
const animalMoves = (r: SessionResponse) => (r.state.events ?? []).filter((event) => event.type === 'farm.animalMoved')
const total = (r: SessionResponse) => r.scores?.find((score) => score.playerId === r.state.players[0]!.id)?.total

const HOST = { sourceCard: CARD, space: 'day-laborer' }

/** Asserts the reorganization wait of a granted `reorganize`, then submits it. */
const reorganizeGrantedSheep = (session: GameSession, reactions: Reaction[], response: SessionResponse, baseline: number | undefined) => {
  expect(response.ok, response.error).toBe(true)
  expect(waiting(response)).toEqual({ kind: 'animal-reorg', playerIndex: 0 })
  // The host ran its before phase once; the sub-flow leaf does not repeat it.
  expect(reactions).toEqual([{ actionId: 'reorganize', phase: 'before', ...HOST, result: undefined }])
  expect(response.state.players[0]).toMatchObject({ houseAnimalCount: 0 })
  expect(response.state.players[0]!.resources.sheep).toBe(1)
  expect(logs(response, 'log.placeFarmer')).toHaveLength(1)
  expect(logs(response, 'log.farmAnimalMoved')).toEqual([])
  expect(animalMoves(response)).toEqual([])
  expect(total(response)).toBe(baseline)

  const submitted = session.resolveChoice(0, 'confirm', SHEEP_IN_HOUSE)

  expect(submitted.ok, submitted.error).toBe(true)
  expect(waiting(submitted)).toEqual({ kind: 'confirm-next-player', playerIndex: 0 })
  // Completion reactions run once, after the reorganization, as the host.
  expect(reactions).toEqual([
    { actionId: 'reorganize', phase: 'before', ...HOST, result: undefined },
    { actionId: 'reorganize', phase: 'immediatelyAfter', ...HOST, result: 'ok' },
    { actionId: 'reorganize', phase: 'after', ...HOST, result: 'ok' },
  ])
  expect(submitted.state.players[0]).toMatchObject({ houseAnimalType: 'sheep', houseAnimalCount: 1 })
  expect(submitted.state.players[0]!.resources).toMatchObject({ sheep: 1, wood: 0 })
  expect(logs(submitted, 'log.placeFarmer')).toHaveLength(1)
  expect(logs(submitted, 'log.farmAnimalMoved')).toHaveLength(1)
  expect(animalMoves(submitted)).toHaveLength(1)
  expect(total(submitted)).toBe(baseline)
}

describe('an action that hands its animal reorganization to the sub-flow', () => {
  it('completes a granted reorganize leaf once, as the host, after the reorganization', () => {
    const { session, reactions } = setupGrant({ type: 'leaf', actionId: 'reorganize', sourceCard: CARD })
    const baseline = total(session.getState())

    reorganizeGrantedSheep(session, reactions, session.takeAction(0, 'day-laborer'), baseline)
  })

  it('completes a reorganize chosen through an XOR branch the same way', () => {
    const { session, reactions } = setupGrant({ type: 'xor', children: [
      { type: 'leaf', actionId: 'reorganize', sourceCard: CARD },
      { type: 'leaf', actionId: 'gain', sourceCard: CARD, params: { wood: 1 } },
    ] })
    const baseline = total(session.getState())

    const offered = session.takeAction(0, 'day-laborer')

    expect(offered.ok, offered.error).toBe(true)
    expect(waiting(offered)).toEqual({ kind: 'choice', playerIndex: 0 })
    expect(reactions).toEqual([])
    expect(offered.state.players[0]!.resources).toMatchObject({ sheep: 1, wood: 0 })
    expect(logs(offered, 'log.placeFarmer')).toHaveLength(1)
    expect(total(offered)).toBe(baseline)
    const branch = choiceOptions(offered).find((option) => option.labelKey === 'actions.reorganize.name')
    expect(branch).toBeDefined()

    reorganizeGrantedSheep(session, reactions, session.resolveChoice(0, branch!.value), baseline)
  })

  it('completes an accepted optional reorganize the same way', () => {
    const { session, reactions } = setupGrant({ type: 'leaf', actionId: 'reorganize', sourceCard: CARD, optional: true })
    const baseline = total(session.getState())

    const offered = session.takeAction(0, 'day-laborer')

    expect(offered.ok, offered.error).toBe(true)
    expect(waiting(offered)).toEqual({ kind: 'choice', playerIndex: 0 })
    expect(choiceOptions(offered).map((option) => option.value)).toContain('__skip__')
    expect(reactions).toEqual([])
    expect(offered.state.players[0]!.resources.sheep).toBe(1)
    expect(logs(offered, 'log.placeFarmer')).toHaveLength(1)
    expect(total(offered)).toBe(baseline)
    const accept = choiceOptions(offered).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    reorganizeGrantedSheep(session, reactions, session.resolveChoice(0, accept!.value), baseline)
  })

  it('runs breed completion reactions once after a last-harvest enforced reorganization', () => {
    const session = createWorkSession({ configure: (state) => {
      state.round = 14
      for (const player of state.players) {
        markAllWorkersUsed(state, player)
        player.resources.food = 20
      }
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      player.resources = { ...player.resources, sheep: 1 }
      player.houseAnimalType = 'sheep'
      player.houseAnimalCount = 1
    } })
    const reactions: Reaction[] = []
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('last-harvest enforcement')
      registry.setEffect({ id: CARD, enforceReorganizeOnLastHarvest: () => true })
      ;[...recordPhases('breed', reactions), ...recordPhases('reorganize', reactions)]
        .forEach((registration) => registry.registerListener(registration))
    })
    const baseline = total(session.getState())

    const enforced = session.performRoundEnd()

    expect(enforced.ok, enforced.error).toBe(true)
    expect(waiting(enforced)).toEqual({ kind: 'animal-reorg', playerIndex: 0 })
    // One sheep cannot breed; the card still requires a final reorganization.
    expect(enforced.state.harvestBreedSummary?.[enforced.state.players[0]!.id]).toEqual({ resources: {}, animalTypes: 0, animalCount: 0 })
    expect(enforced.state.players[0]).toMatchObject({ houseAnimalType: 'sheep', houseAnimalCount: 1 })
    expect(enforced.state.gameOver).toBe(false)
    expect(logs(enforced, 'log.farmAnimalMoved')).toEqual([])
    expect(logs(enforced, 'log.gameOver')).toEqual([])
    expect(total(enforced)).toBe(baseline)
    const breedBefore = reactions.find((reaction) => reaction.actionId === 'breed')
    expect(breedBefore).toMatchObject({ phase: 'before', sourceCard: 'harvest', result: undefined })
    // The reorganization is a real sub-flow for a breed host: its own phases stay.
    expect(reactions).toEqual([
      breedBefore,
      { actionId: 'reorganize', phase: 'before', sourceCard: undefined, space: '__subflow:reorganize', result: undefined },
    ])

    const finished = session.resolveChoice(0, 'confirm', SHEEP_IN_HOUSE)

    expect(finished.ok, finished.error).toBe(true)
    expect(waiting(finished)).toEqual({ kind: 'gameover' })
    expect(finished.state.gameOver).toBe(true)
    expect(reactions).toEqual([
      breedBefore,
      { actionId: 'reorganize', phase: 'before', sourceCard: undefined, space: '__subflow:reorganize', result: undefined },
      { actionId: 'reorganize', phase: 'immediatelyAfter', sourceCard: undefined, space: '__subflow:reorganize', result: 'ok' },
      { actionId: 'reorganize', phase: 'after', sourceCard: undefined, space: '__subflow:reorganize', result: 'ok' },
      { actionId: 'breed', phase: 'immediatelyAfter', sourceCard: 'harvest', space: breedBefore!.space, result: 'ok' },
      { actionId: 'breed', phase: 'after', sourceCard: 'harvest', space: breedBefore!.space, result: 'ok' },
    ])
    expect(finished.state.players[0]).toMatchObject({ houseAnimalType: 'sheep', houseAnimalCount: 1 })
    expect(logs(finished, 'log.farmAnimalMoved')).toHaveLength(1)
    expect(logs(finished, 'log.gameOver')).toHaveLength(1)
    expect(total(finished)).toBe(baseline)
  })

  it('leaves a system reorganization without a host to run its own phases', () => {
    const { session, reactions } = setupGrant({ type: 'leaf', actionId: 'gain', sourceCard: CARD, params: { sheep: 1 } }, 0)
    const baseline = total(session.getState())

    const gained = session.takeAction(0, 'day-laborer')

    expect(gained.ok, gained.error).toBe(true)
    expect(waiting(gained)).toEqual({ kind: 'animal-reorg', playerIndex: 0 })
    expect(reactions).toEqual([
      { actionId: 'reorganize', phase: 'before', sourceCard: undefined, space: '__subflow:reorganize', result: undefined },
    ])
    expect(gained.state.players[0]!.resources.sheep).toBe(1)
    expect(logs(gained, 'log.cardEffectGain')).toHaveLength(1)
    expect(logs(gained, 'log.farmAnimalMoved')).toEqual([])
    const withSheep = total(gained)
    expect(withSheep).toBeGreaterThan(baseline!)

    const placed = session.resolveChoice(0, 'confirm', SHEEP_IN_HOUSE)

    expect(placed.ok, placed.error).toBe(true)
    expect(waiting(placed)).toEqual({ kind: 'confirm-next-player', playerIndex: 0 })
    expect(reactions).toEqual([
      { actionId: 'reorganize', phase: 'before', sourceCard: undefined, space: '__subflow:reorganize', result: undefined },
      { actionId: 'reorganize', phase: 'immediatelyAfter', sourceCard: undefined, space: '__subflow:reorganize', result: 'ok' },
      { actionId: 'reorganize', phase: 'after', sourceCard: undefined, space: '__subflow:reorganize', result: 'ok' },
    ])
    expect(placed.state.players[0]).toMatchObject({ houseAnimalType: 'sheep', houseAnimalCount: 1 })
    expect(logs(placed, 'log.farmAnimalMoved')).toHaveLength(1)
    expect(total(placed)).toBe(withSheep)
  })
})
