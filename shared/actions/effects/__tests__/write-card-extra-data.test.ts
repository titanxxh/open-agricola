import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../../game/types'
import { writeCardExtraDataAction } from '../write-card-extra-data'
import { mkActionSpace } from '../../../cards/__tests__/fixtures'

const createPlayer = (): PlayerState =>
  ({ id: 'p1', cardStates: {} }) as unknown as PlayerState

const createState = () =>
  ({ round: 1, players: [] }) as never

describe('write-card-extra-data action', () => {
  it('merges data into card extraData', () => {
    const player = createPlayer()
    const result = writeCardExtraDataAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'TestCard',
      params: { data: { count: 3, label: 'test' } },
    })
    expect(result.type).toBe('ok')
    expect(player.cardStates?.TestCard?.extraData).toEqual({ count: 3, label: 'test' })
  })

  it('merges with existing extraData', () => {
    const player = createPlayer()
    player.cardStates = { TestCard: { extraData: { existing: true } } }
    const result = writeCardExtraDataAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'TestCard',
      params: { data: { count: 1 } },
    })
    expect(result.type).toBe('ok')
    expect(player.cardStates?.TestCard?.extraData).toEqual({ existing: true, count: 1 })
  })

  it('fails without sourceCard', () => {
    const player = createPlayer()
    const result = writeCardExtraDataAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      params: { data: { x: 1 } },
    })
    expect(result.type).toBe('fail')
  })

  it('fails without data param', () => {
    const player = createPlayer()
    const result = writeCardExtraDataAction.execute({
      state: createState(),
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'TestCard',
      params: {},
    })
    expect(result.type).toBe('fail')
  })
})
