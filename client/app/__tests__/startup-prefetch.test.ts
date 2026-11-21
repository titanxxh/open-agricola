import { describe, expect, it, vi } from 'vitest'
import { platformPageFromSearch } from '../platform-page'
import { afterFirstRender, prefetchCardScreen, showsCards } from '../startup-prefetch'

describe('platform page from a URL', () => {
  it.each([
    ['', 'lobby'],
    ['?page=encyclopedia&card=A004', 'encyclopedia'],
    ['?page=workshop', 'workshop'],
    ['?page=lobby&room=r1', 'lobby'],
    ['?context=c1', 'game'],
    ['?context=', 'lobby'],
    ['?room=r1', 'game'],
    ['?transport=ws', 'game'],
    ['?page=unknown&room=r1', 'game'],
    ['?page=prerelease-handoff', 'prerelease-handoff'],
  ])('reads %s as %s', (search, page) => {
    expect(platformPageFromSearch(search)).toBe(page)
  })

  it('takes the hot-seat setup check from the caller', () => {
    expect(platformPageFromSearch('?hotseat=1')).toBe('lobby')
    expect(platformPageFromSearch('?hotseat=1', search => search.includes('hotseat'))).toBe('game')
  })
})

describe('startup downloads for the opened screen', () => {
  const loaders = () => ({
    cardText: vi.fn(async () => undefined),
    cardsManifest: vi.fn(async () => undefined),
    screen: { game: vi.fn(async () => undefined), encyclopedia: vi.fn(async () => undefined) },
  })

  it('starts card text, card metadata and only the opened screen chunk', () => {
    const value = loaders()
    prefetchCardScreen('game', value)
    expect(value.cardText).toHaveBeenCalledOnce()
    expect(value.cardsManifest).toHaveBeenCalledOnce()
    expect(value.screen.game).toHaveBeenCalledOnce()
    expect(value.screen.encyclopedia).not.toHaveBeenCalled()
  })

  it('leaves a failed download for the screen to retry', async () => {
    const value = { ...loaders(), cardsManifest: vi.fn(() => Promise.reject(new Error('offline'))) }
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    prefetchCardScreen('workshop', value)
    await new Promise(resolve => setTimeout(resolve, 0))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(value.cardText).toHaveBeenCalledOnce()
  })

  it('treats only card screens as needing card data at startup', () => {
    expect(['game', 'workshop', 'encyclopedia'].every(page => showsCards(page as 'game'))).toBe(true)
    expect(['lobby', 'login', 'settings', 'onboarding', 'operations'].some(page => showsCards(page as 'lobby'))).toBe(false)
  })

  it('runs a deferred task only after a painted frame and an idle period', () => {
    const order: string[] = []
    const frames: Array<() => void> = [], timers: Array<() => void> = [], idles: Array<() => void> = []
    const win = {
      requestAnimationFrame: (callback: FrameRequestCallback) => { frames.push(() => callback(0)); return 1 },
      setTimeout: ((callback: () => void) => { timers.push(callback); return 1 }) as unknown as Window['setTimeout'],
      requestIdleCallback: ((callback: IdleRequestCallback) => { idles.push(() => callback({ didTimeout: false, timeRemaining: () => 10 })); return 1 }) as Window['requestIdleCallback'],
    }
    afterFirstRender(() => order.push('task'), win)
    expect(order).toEqual([])
    frames.shift()!(); timers.shift()!()
    expect(order).toEqual([])
    idles.shift()!()
    expect(order).toEqual(['task'])
  })

  it('falls back to a short timer where idle callbacks are missing', () => {
    const timers: Array<() => void> = []
    const task = vi.fn()
    afterFirstRender(task, { setTimeout: ((callback: () => void) => { timers.push(callback); return 1 }) as unknown as Window['setTimeout'] })
    timers.shift()!(); expect(task).not.toHaveBeenCalled()
    timers.shift()!(); expect(task).toHaveBeenCalledOnce()
  })
})
