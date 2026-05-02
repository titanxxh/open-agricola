import { describe, it, expect } from 'vitest'
import { CardRegistry, type CardImpl } from '../registry'
import type { CardListenerRegistration } from '../card-listeners'
import type { CardEffect } from '../card-effects'
import type { CostModifier } from '../../game/types'

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

  describe('unload', () => {
    const makeFullImpl = (cardId: string): CardImpl => ({
      listeners: [
        {
          id: `${cardId}-listener`,
          cardIds: [cardId],
          phases: ['before'],
          actions: ['collect'],
          handler: () => undefined,
        } satisfies CardListenerRegistration,
      ],
      effect: { id: cardId, onBuy: () => undefined } satisfies CardEffect,
      modifiers: [{
        type: 'trade',
        cardId,
        appliesTo: ['occupation'],
        from: { wood: 1 },
        to: { food: 1 },
      } satisfies CostModifier],
    })

    it('removes listeners, effect, and modifiers in one call', () => {
      const registry = new CardRegistry()
      registry.loadImpl('X1_Test', makeFullImpl('X1_Test'))
      expect(registry.hasCard('X1_Test')).toBe(true)

      registry.unload('X1_Test')

      expect(registry.getListenersFor('X1_Test')).toEqual([])
      expect(registry.getEffect('X1_Test')).toBeUndefined()
      expect(registry.getModifiers('X1_Test')).toEqual([])
      expect(registry.hasCard('X1_Test')).toBe(false)
    })

    it('is a no-op for a card that was never loaded', () => {
      const registry = new CardRegistry()
      expect(() => registry.unload('X_Unknown')).not.toThrow()
      expect(registry.getListenersFor('X_Unknown')).toEqual([])
      expect(registry.getEffect('X_Unknown')).toBeUndefined()
      expect(registry.getModifiers('X_Unknown')).toEqual([])
    })

    it('only removes the targeted card, leaving others intact', () => {
      const registry = new CardRegistry()
      registry.loadImpl('X1_Test', makeFullImpl('X1_Test'))
      registry.loadImpl('X2_Other', makeFullImpl('X2_Other'))

      registry.unload('X1_Test')

      expect(registry.hasCard('X1_Test')).toBe(false)
      expect(registry.hasCard('X2_Other')).toBe(true)
      expect(registry.getEffect('X2_Other')).toBeDefined()
      expect(registry.getListenersFor('X2_Other')).toHaveLength(1)
      expect(registry.getModifiers('X2_Other')).toHaveLength(1)
    })

    it('supports re-loading the card after unload', () => {
      const registry = new CardRegistry()
      registry.loadImpl('X1_Test', makeFullImpl('X1_Test'))
      registry.unload('X1_Test')

      const reloadImpl = makeFullImpl('X1_Test')
      registry.loadImpl('X1_Test', reloadImpl)

      expect(registry.getEffect('X1_Test')).toBe(reloadImpl.effect)
      expect(registry.getListenersFor('X1_Test')).toEqual(reloadImpl.listeners)
      expect(registry.getModifiers('X1_Test')).toEqual(reloadImpl.modifiers)
      expect(registry.hasCard('X1_Test')).toBe(true)
    })

    it('is reflected in snapshot', () => {
      const registry = new CardRegistry()
      registry.loadImpl('X1_Test', makeFullImpl('X1_Test'))
      registry.loadImpl('X2_Other', makeFullImpl('X2_Other'))

      registry.unload('X1_Test')

      const snap = registry.snapshot()
      expect(snap.cardIds).toContain('X2_Other')
      expect(snap.cardIds).not.toContain('X1_Test')
      expect(snap.effectCount).toBe(1)
      expect(snap.listenerCount).toBe(1)
      expect(snap.modifierCount).toBe(1)
    })
  })

  describe('loadByIds', () => {
    const makeImpl = (cardId: string): CardImpl => ({
      effect: { id: cardId, onBuy: () => undefined } satisfies CardEffect,
    })

    it('loads each id resolved by the lookup function', () => {
      const registry = new CardRegistry()
      const table: Record<string, CardImpl> = {
        X1_Test: makeImpl('X1_Test'),
        X2_Other: makeImpl('X2_Other'),
      }

      registry.loadByIds(['X1_Test', 'X2_Other'], (id) => table[id])

      expect(registry.getEffect('X1_Test')).toBe(table.X1_Test.effect)
      expect(registry.getEffect('X2_Other')).toBe(table.X2_Other.effect)
      expect(registry.snapshot().cardIds.sort()).toEqual(['X1_Test', 'X2_Other'])
    })

    it('skips ids whose lookup returns undefined', () => {
      const registry = new CardRegistry()
      const table: Record<string, CardImpl> = {
        X1_Test: makeImpl('X1_Test'),
      }
      const seen: string[] = []
      const lookup = (id: string): CardImpl | undefined => {
        seen.push(id)
        return table[id]
      }

      registry.loadByIds(['X1_Test', 'X_Unknown', 'X_AlsoMissing'], lookup)

      expect(seen).toEqual(['X1_Test', 'X_Unknown', 'X_AlsoMissing'])
      expect(registry.hasCard('X1_Test')).toBe(true)
      expect(registry.hasCard('X_Unknown')).toBe(false)
      expect(registry.hasCard('X_AlsoMissing')).toBe(false)
      expect(registry.snapshot().cardIds).toEqual(['X1_Test'])
    })

    it('does nothing when given an empty id list', () => {
      const registry = new CardRegistry()
      let calls = 0
      registry.loadByIds([], () => {
        calls += 1
        return undefined
      })
      expect(calls).toBe(0)
      expect(registry.snapshot().cardIds).toEqual([])
    })

    it('last duplicate id wins (matches loadImpl overwrite behavior)', () => {
      const registry = new CardRegistry()
      const firstImpl = makeImpl('X1_Test')
      const secondImpl = makeImpl('X1_Test')
      const lookupQueue = [firstImpl, secondImpl]
      const lookup = (): CardImpl | undefined => lookupQueue.shift()

      registry.loadByIds(['X1_Test', 'X1_Test'], lookup)

      expect(registry.getEffect('X1_Test')).toBe(secondImpl.effect)
    })

    it('composes with unload so draft churn stays consistent', () => {
      const registry = new CardRegistry()
      const table: Record<string, CardImpl> = {
        X1_Test: makeImpl('X1_Test'),
        X2_Other: makeImpl('X2_Other'),
        X3_Third: makeImpl('X3_Third'),
      }

      registry.loadByIds(['X1_Test', 'X2_Other', 'X3_Third'], (id) => table[id])
      registry.unload('X2_Other')

      const snap = registry.snapshot()
      expect(snap.cardIds.sort()).toEqual(['X1_Test', 'X3_Third'])
      expect(registry.getEffect('X2_Other')).toBeUndefined()
    })
  })
})
