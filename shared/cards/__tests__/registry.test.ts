import { describe, it, expect } from 'vitest'
import { CardRegistry } from '../registry'
import type { CardListenerRegistration } from '../card-listeners'
import type { CardEffect } from '../card-effects'

describe('CardRegistry', () => {
  it('stores listeners by cardId after loadImpl', () => {
    const registry = new CardRegistry()
    const listener: CardListenerRegistration = {
      id: 'test-listener',
      cardIds: ['X1_Test'],
      phases: ['before'],
      actions: ['collect'],
      handler: () => undefined,
    }
    registry.loadImpl('X1_Test', { listeners: [listener] })
    expect(registry.getListenersFor('X1_Test')).toEqual([listener])
  })

  it('returns empty listeners for unknown card', () => {
    const registry = new CardRegistry()
    expect(registry.getListenersFor('X_Unknown')).toEqual([])
  })

  it('stores and retrieves effect by cardId', () => {
    const registry = new CardRegistry()
    const effect: CardEffect = { id: 'X1_Test', onBuy: () => undefined }
    registry.loadImpl('X1_Test', { effect })
    expect(registry.getEffect('X1_Test')).toBe(effect)
  })

  it('unload removes card entries', () => {
    const registry = new CardRegistry()
    const listener: CardListenerRegistration = {
      id: 'test-listener',
      cardIds: ['X1_Test'],
      handler: () => undefined,
    }
    registry.loadImpl('X1_Test', { listeners: [listener] })
    registry.unload('X1_Test')
    expect(registry.getListenersFor('X1_Test')).toEqual([])
  })

  it('snapshot returns current state copy', () => {
    const registry = new CardRegistry()
    registry.loadImpl('X1_Test', { effect: { id: 'X1_Test' } })
    const snap = registry.snapshot()
    expect(snap.cardIds).toContain('X1_Test')
  })

  it('keeps separate registries independent', () => {
    const r1 = new CardRegistry()
    const r2 = new CardRegistry()
    r1.loadImpl('X1_Test', { effect: { id: 'X1_Test' } })
    expect(r2.getEffect('X1_Test')).toBeUndefined()
  })
})
