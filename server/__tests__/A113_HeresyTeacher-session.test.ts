import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { reap } from '../../shared/actions/effects/reap'
import { computeScores } from '../../shared/domain/scoring'
import type { Field } from '../../shared/contract/types'

import '../../shared/cards/A/A113_HeresyTeacher'

const CARD_ID = 'A113_HeresyTeacher'
const LISTENER_ID = 'A113-heresy-teacher-after-lessons'

type FieldSeed = Field

const makeField = (
  row: number,
  col: number,
  stacks: Field['stacks'],
): FieldSeed => ({ row, col, stacks: stacks.map((s) => ({ ...s })) })

const setup = (options?: {
  withCard?: boolean
  playerCount?: number
  fields?: FieldSeed[]
}) => {
  const playerCount = options?.playerCount ?? 2
  const session = new GameSession(undefined, undefined, { playerCount })
  const state = session.getState().state
  state.players = state.players.slice(0, playerCount)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  if (options?.fields) {
    player.fields = options.fields
  } else {
    player.fields = [
      makeField(0, 0, [{ kind: 'grain', remaining: 3 }]),
      makeField(0, 1, [{ kind: 'grain', remaining: 2 }]),
      makeField(1, 0, []),
    ]
  }
  if (options?.withCard ?? true) {
    if (!player.occupationPlayed.includes(CARD_ID)) {
      player.occupationPlayed.push(CARD_ID)
      player.playedCards.push(`occupation:${CARD_ID}`)
    }
  }

  session.loadState(state)
  return session
}

const fireListener = (
  session: GameSession,
  spaceId: string = 'lessons',
) => {
  const s = session.getState().state
  const listener = getRegisteredCardListeners().find((l) => l.id === LISTENER_ID)
  if (!listener) throw new Error('A113 listener not registered')
  const space = s.actionSpaces.find((x) => x.id === spaceId)
  if (!space) throw new Error(`space ${spaceId} not found`)
  return executeCardListener(listener, {
    state: s,
    player: s.players[0]!,
    space,
    actionId: 'place-farmer',
    phase: 'after',
  } as unknown as CardListenerContext)
}

describe('A113 Heresy Teacher session', () => {
  it('listener is registered', () => {
    const listener = getRegisteredCardListeners().find((l) => l.id === LISTENER_ID)
    expect(listener).toBeDefined()
  })

  it('unshifts vegetable(1) under grain(3) on lessons; other fields untouched', () => {
    const session = setup()
    fireListener(session, 'lessons')
    const p1 = session.getState().state.players[0]!
    expect(p1.fields[0]!.stacks).toEqual([
      { kind: 'vegetable', remaining: 1 },
      { kind: 'grain', remaining: 3 },
    ])
    expect(p1.fields[1]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(p1.fields[2]!.stacks).toEqual([])
  })

  it('is self-limiting: second trigger leaves already-mixed field unchanged', () => {
    const session = setup({
      fields: [
        makeField(0, 0, [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 3 },
        ]),
      ],
    })
    fireListener(session, 'lessons')
    const p1 = session.getState().state.players[0]!
    expect(p1.fields[0]!.stacks).toEqual([
      { kind: 'vegetable', remaining: 1 },
      { kind: 'grain', remaining: 3 },
    ])
  })

  it('triggers on lessons-4 space in 4-player game', () => {
    const session = setup({ playerCount: 4 })
    fireListener(session, 'lessons-4')
    const p1 = session.getState().state.players[0]!
    expect(p1.fields[0]!.stacks).toEqual([
      { kind: 'vegetable', remaining: 1 },
      { kind: 'grain', remaining: 3 },
    ])
  })

  it('triggers on lessons-3 space in 3-player game', () => {
    const session = setup({ playerCount: 3 })
    fireListener(session, 'lessons-3')
    const p1 = session.getState().state.players[0]!
    expect(p1.fields[0]!.stacks).toEqual([
      { kind: 'vegetable', remaining: 1 },
      { kind: 'grain', remaining: 3 },
    ])
  })

  it('does not trigger on non-lessons spaces', () => {
    const session = setup()
    fireListener(session, 'forest')
    const p1 = session.getState().state.players[0]!
    expect(p1.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })


  it('does not add veg to non-qualifying fields', () => {
    const session = setup({
      fields: [
        makeField(0, 0, [{ kind: 'grain', remaining: 2 }]),
        makeField(0, 1, [{ kind: 'vegetable', remaining: 1 }]),
        makeField(1, 0, []),
      ],
    })
    fireListener(session, 'lessons')
    const p1 = session.getState().state.players[0]!
    expect(p1.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(p1.fields[1]!.stacks).toEqual([{ kind: 'vegetable', remaining: 1 }])
    expect(p1.fields[2]!.stacks).toEqual([])
  })

  it('buried vegetable is exposed after top grain depletes via reap', () => {
    const session = setup({
      fields: [
        makeField(0, 0, [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 3 },
        ]),
      ],
    })
    const state = session.getState().state
    const p1 = state.players[0]!
    p1.resources.grain = 0
    p1.resources.vegetable = 0

    // Three reaps drain the grain stack.
    reap(state, p1)
    reap(state, p1)
    reap(state, p1)
    expect(p1.resources.grain).toBe(3)
    expect(p1.fields[0]!.stacks).toEqual([{ kind: 'vegetable', remaining: 1 }])

    // Fourth reap harvests the exposed vegetable.
    reap(state, p1)
    expect(p1.resources.vegetable).toBe(1)
    expect(p1.fields[0]!.stacks).toEqual([])
  })

  it('scoring counts mixed field as both grain-field and vegetable-field', () => {
    const session = setup({
      fields: [
        makeField(0, 0, [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 3 },
        ]),
        makeField(0, 1, [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 3 },
        ]),
        makeField(1, 0, [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 3 },
        ]),
        makeField(1, 1, [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 3 },
        ]),
      ],
    })
    const state = session.getState().state
    const p1 = state.players[0]!
    p1.resources.grain = 0
    p1.resources.vegetable = 0

    const scores = computeScores(state)
    const mine = scores.find((s) => s.playerId === p1.id)!
    const grains = mine.categories.find((c) => c.key === 'grains')!
    const vegetables = mine.categories.find((c) => c.key === 'vegetables')!
    // 4 mixed fields → grain count = 4 (≥4 → 2 pts), vegetable count = 4 (≥4 → 4 pts)
    expect(grains.quantity).toBe(4)
    expect(vegetables.quantity).toBe(4)
  })
})
