import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../../game/types'
import { pushCardStackAction } from '../push-card-stack'
import { mkActionSpace } from '../../../cards/__tests__/fixtures'

const createPlayer = (): PlayerState =>
  ({ id: 'p1', cardStates: {} }) as unknown as PlayerState

const createState = () =>
  ({ round: 1, players: [] }) as never

describe('push-card-stack action', () => {
  it('pushes multiple items onto the card stack', () => {
    const player = createPlayer()
    const result = pushCardStackAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'TestCard',
      params: { items: ['wood', 'clay', 'stone'] },
    })
    expect(result.type).toBe('ok')
    expect(player.cardStates?.TestCard?.stack).toEqual(['wood', 'clay', 'stone'])
  })

  it('appends to existing stack', () => {
    const player = createPlayer()
    player.cardStates = { TestCard: { stack: ['food'] } }
    const result = pushCardStackAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'TestCard',
      params: { items: ['wood'] },
    })
    expect(result.type).toBe('ok')
    expect(player.cardStates?.TestCard?.stack).toEqual(['food', 'wood'])
  })

  it('fails without sourceCard', () => {
    const player = createPlayer()
    const result = pushCardStackAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      params: { items: ['wood'] },
    })
    expect(result.type).toBe('fail')
  })

  it('fails without items array', () => {
    const player = createPlayer()
    const result = pushCardStackAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'TestCard',
      params: {},
    })
    expect(result.type).toBe('fail')
  })

  it('fails with empty items array', () => {
    const player = createPlayer()
    const result = pushCardStackAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'TestCard',
      params: { items: [] },
    })
    expect(result.type).toBe('fail')
  })
})
