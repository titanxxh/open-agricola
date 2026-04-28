import { describe, it, expect } from 'vitest'
import {
  readCardResourceStats,
  incCardUsed,
  addCardResourcePaid,
  addCardResourceGained,
  addCardResourceSaved,
  addCardResourceReceivedPayment,
  addCardResourcePaidToOthers,
} from '../card-state'
import type { PlayerState } from '../../../game/types'

const mockPlayer = (): PlayerState =>
  ({ id: 'p1', cardStates: {} } as unknown as PlayerState)

describe('per-card stats helpers', () => {
  it('incCardUsed increments from 0 -> 1 -> 2', () => {
    const p = mockPlayer()
    incCardUsed(p, 'A1')
    expect(readCardResourceStats(p, 'A1')?.used).toBe(1)
    incCardUsed(p, 'A1')
    expect(readCardResourceStats(p, 'A1')?.used).toBe(2)
  })

  it('addCardResourceSaved accumulates per-resource', () => {
    const p = mockPlayer()
    addCardResourceSaved(p, 'C16', { wood: 1 })
    addCardResourceSaved(p, 'C16', { wood: 2, clay: 1 })
    expect(readCardResourceStats(p, 'C16')?.saved).toEqual({ wood: 3, clay: 1 })
  })

  it('addCardResourceReceivedPayment writes to receivedPayment field', () => {
    const p = mockPlayer()
    addCardResourceReceivedPayment(p, 'E103', { food: 2 })
    expect(readCardResourceStats(p, 'E103')?.receivedPayment).toEqual({ food: 2 })
  })

  it('addCardResourcePaidToOthers writes to paidToOthers field', () => {
    const p = mockPlayer()
    addCardResourcePaidToOthers(p, 'X1', { sheep: 1 })
    expect(readCardResourceStats(p, 'X1')?.paidToOthers).toEqual({ sheep: 1 })
  })

  it('helpers do not interfere with each other', () => {
    const p = mockPlayer()
    incCardUsed(p, 'A1')
    addCardResourceGained(p, 'A1', { wood: 2 })
    addCardResourcePaid(p, 'A1', { food: 1 })
    addCardResourceSaved(p, 'A1', { wood: 1 })
    const stats = readCardResourceStats(p, 'A1')
    expect(stats).toEqual({
      used: 1,
      gained: { wood: 2 },
      paid: { food: 1 },
      saved: { wood: 1 },
      receivedPayment: {},
      paidToOthers: {},
    })
  })

  it('non-positive amounts are ignored and create no card state', () => {
    const p = mockPlayer()
    addCardResourceSaved(p, 'A1', { wood: 0 })
    addCardResourceSaved(p, 'A1', { wood: -3 })
    expect(readCardResourceStats(p, 'A1')).toBeUndefined()
  })
})
