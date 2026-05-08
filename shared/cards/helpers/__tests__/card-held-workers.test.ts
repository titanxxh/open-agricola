import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../../contract/types'
import {
  holdWorkerOnCard,
  getWorkerHeldOnCard,
  releaseWorkerFromCard,
  getCardHeldWorkerIds,
} from '../card-held-workers'

const makePlayer = (): PlayerState =>
  ({ id: 'p1', cardStates: {} }) as unknown as PlayerState

describe('card-held-workers', () => {
  it('holds and reads a worker id on a card', () => {
    const p = makePlayer()
    holdWorkerOnCard(p, 'C22_BasketChair', '3')
    expect(getWorkerHeldOnCard(p, 'C22_BasketChair')).toBe('3')
  })

  it('returns undefined when no worker is held', () => {
    const p = makePlayer()
    expect(getWorkerHeldOnCard(p, 'C22_BasketChair')).toBeUndefined()
  })

  it('overwrites an existing hold', () => {
    const p = makePlayer()
    holdWorkerOnCard(p, 'C22_BasketChair', '3')
    holdWorkerOnCard(p, 'C22_BasketChair', '4')
    expect(getWorkerHeldOnCard(p, 'C22_BasketChair')).toBe('4')
  })

  it('release returns the previously held worker id and clears it', () => {
    const p = makePlayer()
    holdWorkerOnCard(p, 'C22_BasketChair', '3')
    expect(releaseWorkerFromCard(p, 'C22_BasketChair')).toBe('3')
    expect(getWorkerHeldOnCard(p, 'C22_BasketChair')).toBeUndefined()
  })

  it('release is a no-op when nothing is held', () => {
    const p = makePlayer()
    expect(releaseWorkerFromCard(p, 'C22_BasketChair')).toBeUndefined()
  })

  it('getCardHeldWorkerIds aggregates across cards', () => {
    const p = makePlayer()
    holdWorkerOnCard(p, 'C22_BasketChair', '3')
    holdWorkerOnCard(p, 'X_OtherCard', '4')
    expect(getCardHeldWorkerIds(p)).toEqual(new Set(['3', '4']))
  })

  it('getCardHeldWorkerIds returns empty set on a fresh player', () => {
    expect(getCardHeldWorkerIds(makePlayer())).toEqual(new Set<string>())
  })
})
