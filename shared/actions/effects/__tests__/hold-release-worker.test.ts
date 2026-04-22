import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../../game/types'
import { holdWorkerOnCardAction } from '../hold-worker-on-card'
import { releaseWorkerFromCardAction } from '../release-worker-from-card'
import { getWorkerHeldOnCard } from '../../../cards/helpers/card-held-workers'
import { mkActionSpace } from '../../../cards/__tests__/fixtures'

const createPlayer = (): PlayerState =>
  ({ id: 'p1', cardStates: {} }) as unknown as PlayerState

const createState = () =>
  ({ round: 1, players: [] }) as never

describe('hold-worker-on-card action', () => {
  it('holds a worker on the source card', () => {
    const player = createPlayer()
    const result = holdWorkerOnCardAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'TestCard',
      params: { workerId: 'w3' },
    })
    expect(result.type).toBe('ok')
    expect(getWorkerHeldOnCard(player, 'TestCard')).toBe('w3')
  })

  it('fails without sourceCard', () => {
    const player = createPlayer()
    const result = holdWorkerOnCardAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      params: { workerId: 'w3' },
    })
    expect(result.type).toBe('fail')
  })

  it('fails without workerId', () => {
    const player = createPlayer()
    const result = holdWorkerOnCardAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'TestCard',
      params: {},
    })
    expect(result.type).toBe('fail')
  })
})

describe('release-worker-from-card action', () => {
  it('releases the held worker', () => {
    const player = createPlayer()
    // First hold a worker
    holdWorkerOnCardAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'TestCard',
      params: { workerId: 'w3' },
    })
    expect(getWorkerHeldOnCard(player, 'TestCard')).toBe('w3')

    // Then release it
    const result = releaseWorkerFromCardAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'TestCard',
    })
    expect(result.type).toBe('ok')
    expect(getWorkerHeldOnCard(player, 'TestCard')).toBeUndefined()
  })

  it('succeeds even when no worker is held', () => {
    const player = createPlayer()
    const result = releaseWorkerFromCardAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'TestCard',
    })
    expect(result.type).toBe('ok')
  })

  it('fails without sourceCard', () => {
    const player = createPlayer()
    const result = releaseWorkerFromCardAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
    })
    expect(result.type).toBe('fail')
  })
})
