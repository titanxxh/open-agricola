import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import type { FarmSownEvent } from '../../shared/contract/events'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { setWorkersAtHome } from '../../shared/domain/player'
import { createWorkSession } from './_helpers/session-fixtures'

import '../../shared/cards/E/E017_SkimmerPlow'
import '../../shared/cards/B/B115_TinsmithMaster'
import '../../shared/cards/E/E071_CowPatty'

/**
 * #1891 Sow amount modifier point: fixed and optional modifiers are settled
 * inside the Sow before anything is placed.
 */
const SKIMMER = 'E017_SkimmerPlow'
const TINSMITH = 'B115_TinsmithMaster'
const COW_PATTY = 'E071_CowPatty'
const GRANTER = 'TEST_SowAmountGranter'
const FILLER = '__test_placeholder__'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

type Setup = {
  minorPlayed?: string[]
  occupationPlayed?: string[]
  minorHand?: string[]
  opponentMinorPlayed?: string[]
  grain?: number
  vegetable?: number
  fields?: { row: number; col: number }[]
  pastureTiles?: { row: number; col: number }[]
}

const setup = (options: Setup = {}) => {
  const session = createWorkSession({
    seed: 1891,
    configure: (state: GameState) => {
      state.currentPlayerIndex = 0
      state.roundActionOrder = state.roundActionOrder.map(() => null)
      state.roundActionOrder[0] = 'grain-utilization'
      state.actionSpaces.forEach((space) => { space.takenBy = [] })
      state.players.forEach((player, index) => {
        setWorkersAtHome(state, player, index === 0 ? 2 : 0)
        player.minorHand = [FILLER]
        player.occupationHand = [FILLER]
        player.minorPlayed = []
        player.occupationPlayed = []
        player.fields = []
        player.pastures = []
        player.resources = { ...player.resources, grain: 0, vegetable: 0 }
      })
      const [player, opponent] = state.players as [GameState['players'][number], GameState['players'][number]]
      player.minorPlayed = options.minorPlayed ?? []
      player.occupationPlayed = options.occupationPlayed ?? []
      player.minorHand = options.minorHand ?? [FILLER]
      opponent.minorPlayed = options.opponentMinorPlayed ?? []
      player.resources.grain = options.grain ?? 0
      player.resources.vegetable = options.vegetable ?? 0
      player.fields = (options.fields ?? [{ row: 0, col: 2 }]).map(({ row, col }) => ({ row, col, stacks: [] }))
      if (options.pastureTiles) {
        player.pastures = [{
          id: 'sow-amount-pasture', size: options.pastureTiles.length, tiles: options.pastureTiles,
          stables: 0, animalType: null, animalCount: 0,
        }]
      }
    },
  })
  sessions.push(session)
  return session
}

const sow = (session: GameSession, crops: { row: number; col: number; crop: 'grain' | 'vegetable' }[]) => {
  const started = session.takeAction(0, 'grain-utilization')
  expect(started.ok, started.error).toBe(true)
  expect(started.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } } })
  return session.commitSelectionChoice(0, { crops })
}

const bonusPromptCard = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && response.interaction.request.kind === 'selection'
  ? response.interaction.promptParams?.triggerCardId
  : undefined

const sownEvents = (response: SessionResponse) =>
  response.state.events.filter((event): event is FarmSownEvent & typeof event => event.type === 'farm.sown')

const stacksAt = (response: SessionResponse, row: number, col: number) =>
  response.state.players[0]!.fields.find((field) => field.row === row && field.col === col)?.stacks

describe('#1891 Sow amount modifiers through Session', () => {
  it('a single fixed modifier places one fewer good at once, without a reaction or removal', () => {
    const session = setup({ minorPlayed: [SKIMMER], grain: 1, vegetable: 1, fields: [{ row: 0, col: 2 }, { row: 1, col: 2 }] })

    const response = sow(session, [{ row: 0, col: 2, crop: 'grain' }, { row: 1, col: 2, crop: 'vegetable' }])

    expect(response.ok, response.error).toBe(true)
    expect(bonusPromptCard(response)).toBeUndefined()
    expect(stacksAt(response, 0, 2)).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(stacksAt(response, 1, 2)).toEqual([{ kind: 'vegetable', remaining: 1 }])
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
    expect(sownEvents(response).flatMap((event) => event.sows.map((sow) => sow.added))).toEqual([2, 1])
    expect(response.state.events.some((event) => event.type === 'farm.cropRemoved')).toBe(false)
    expect(response.scores).toHaveLength(2)
  })

  it('a fixed and an optional modifier combine inside the Sow; declining keeps the fixed result', () => {
    for (const accept of [true, false]) {
      const session = setup({ minorPlayed: [SKIMMER], occupationPlayed: [TINSMITH], vegetable: 1 })

      const prompt = sow(session, [{ row: 0, col: 2, crop: 'vegetable' }])

      expect(prompt.ok, prompt.error).toBe(true)
      expect(bonusPromptCard(prompt)).toBe(TINSMITH)
      expect(prompt.interaction).toMatchObject({
        promptParams: { minSelections: 0, maxSelections: 1 },
        request: { selection: { kind: 'farm-position', selectablePositions: [{ row: 0, col: 2 }] } },
      })
      // Nothing is placed or paid while the bonus is open, and a new crop selection is refused.
      expect(stacksAt(prompt, 0, 2)).toEqual([])
      expect(prompt.state.players[0]!.resources.vegetable).toBe(1)
      expect(sownEvents(prompt)).toEqual([])
      // Seeds are committed but unpaid, so no anytime action can spend them here.
      expect(prompt.interaction.stateId === 'wait' ? prompt.interaction.anytimeActions : undefined).toEqual([])
      const discard = session.takeAnytimeAction(0, 'discard-goods')
      expect(discard.ok).toBe(false)
      expect(discard.state.players[0]!.resources.vegetable).toBe(1)
      const resent = session.resolveChoice(0, 'confirm', { crops: [{ row: 0, col: 2, crop: 'vegetable' }] })
      expect(resent.ok).toBe(false)
      expect(stacksAt(resent, 0, 2)).toEqual([])
      expect(resent.interaction).toMatchObject({ promptParams: { triggerCardId: TINSMITH } })

      const done = session.commitSelectionChoice(0, { positions: accept ? [{ row: 0, col: 2 }] : [] })

      expect(done.ok, done.error).toBe(true)
      expect(stacksAt(done, 0, 2)).toEqual([{ kind: 'vegetable', remaining: accept ? 2 : 1 }])
      expect(done.state.players[0]!.resources.vegetable).toBe(0)
      expect(sownEvents(done).flatMap((event) => event.sows.map((sow) => sow.added))).toEqual([accept ? 2 : 1])
    }
  })

  it('asks each optional source once in played-card order and sums every accepted bonus', () => {
    const session = setup({
      minorPlayed: [SKIMMER, COW_PATTY], occupationPlayed: [TINSMITH], grain: 1, pastureTiles: [{ row: 1, col: 2 }],
    })

    const first = sow(session, [{ row: 0, col: 2, crop: 'grain' }])
    expect(bonusPromptCard(first)).toBe(COW_PATTY)
    const second = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(second.ok, second.error).toBe(true)
    expect(bonusPromptCard(second)).toBe(TINSMITH)
    expect(stacksAt(second, 0, 2)).toEqual([])

    const done = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })

    expect(done.ok, done.error).toBe(true)
    expect(stacksAt(done, 0, 2)).toEqual([{ kind: 'grain', remaining: 4 }])
    expect(sownEvents(done).flatMap((event) => event.sows.map((sow) => sow.added))).toEqual([4])
  })

  it('a modifier limited to one granted Sow reads the granting card and leaves an ordinary Sow alone', () => {
    const session = setup({ minorPlayed: [GRANTER], grain: 2, fields: [{ row: 0, col: 2 }, { row: 1, col: 2 }] })
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('one granted Sow modifier')
      registry.setEffect({
        id: GRANTER,
        modifySowAmount: ({ sourceCard }) => sourceCard === GRANTER ? { delta: 2 } : undefined,
      })
      // Stand-in for a card that grants one Sow after Forest.
      registry.registerListener({
        id: `${GRANTER}:after-forest`, cardIds: [GRANTER], phases: ['after'], actions: ['place-farmer'], mandatory: true,
        handler: (context) => context.space?.id !== 'forest' ? undefined : {
          sourceCard: GRANTER,
          flow: { type: 'leaf', actionId: 'sow', sourceCard: GRANTER },
        },
      })
    })

    const granted = session.takeAction(0, 'forest')
    expect(granted.ok, granted.error).toBe(true)
    expect(granted.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } } })
    const grantedSow = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    expect(grantedSow.ok, grantedSow.error).toBe(true)
    expect(stacksAt(grantedSow, 0, 2)).toEqual([{ kind: 'grain', remaining: 5 }])
    expect(grantedSow.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(session.resolveChoice(0, 'confirm').ok).toBe(true)

    const ordinary = sow(session, [{ row: 1, col: 2, crop: 'grain' }])
    expect(ordinary.ok, ordinary.error).toBe(true)
    expect(stacksAt(ordinary, 1, 2)).toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it('counts a repeated target once, by its first crop, like seed validation', () => {
    const session = setup({ vegetable: 1 })

    const response = sow(session, [{ row: 0, col: 2, crop: 'vegetable' }, { row: 0, col: 2, crop: 'grain' }])

    expect(response.ok, response.error).toBe(true)
    expect(stacksAt(response, 0, 2)).toEqual([{ kind: 'vegetable', remaining: 2 }])
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, grain: 0 })
    expect(sownEvents(response).flatMap((event) => event.sows.map((sow) => [sow.crop, sow.added]))).toEqual([['vegetable', 2]])
  })

  it('does not apply a card in hand or an opponent card', () => {
    for (const options of [{ minorHand: [SKIMMER] }, { opponentMinorPlayed: [SKIMMER, COW_PATTY] }] satisfies Setup[]) {
      const session = setup({ ...options, grain: 1, vegetable: 1, fields: [{ row: 0, col: 2 }, { row: 1, col: 2 }], pastureTiles: [{ row: 0, col: 3 }] })

      const response = sow(session, [{ row: 0, col: 2, crop: 'grain' }, { row: 1, col: 2, crop: 'vegetable' }])

      expect(response.ok, response.error).toBe(true)
      expect(bonusPromptCard(response)).toBeUndefined()
      expect(stacksAt(response, 0, 2)).toEqual([{ kind: 'grain', remaining: 3 }])
      expect(stacksAt(response, 1, 2)).toEqual([{ kind: 'vegetable', remaining: 2 }])
    }
  })
})
