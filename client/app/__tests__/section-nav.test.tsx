// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../../shared/i18n'
import { SectionNav } from '../SectionNav'
import {
  ownHandSectionAvailable,
  scrollSectionIntoView,
  sectionNavItems,
  sectionNavName,
  type SectionNavItem,
} from '../section-nav'

const box = (top: number, height: number) => ({
  x: 0, y: top, top, left: 0, right: 240, bottom: top + height, width: 240, height, toJSON: () => ({}),
})

const media = (matches: boolean) => ({
  matches,
  media: '',
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})

const renderNav = (items: readonly SectionNavItem[]) => render(
  <div className="app">
    <header className="header-compact">Round</header>
    <div hidden>
      <div data-section-target="farm" data-hidden-farm="true">Covered farm</div>
    </div>
    <div data-section-target="hand" data-hand-anchor="p2">Other hand</div>
    <div data-section-target="hand" data-hand-anchor="p1">Own hand</div>
    <section data-section-target="farm">Viewed farm</section>
    <section data-section-target="public-farms">Public farms</section>
    <section data-section-target="major-supply" data-interaction-focus="actions">Major supply</section>
    <div className="interaction-bar">Actions</div>
    <SectionNav locale="en" items={items} />
  </div>,
)

const itemsFor = (handPlayerId: string | null = 'p1') => sectionNavItems({
  handPlayerId,
  viewedFarm: true,
  publicFarms: true,
  seasons: false,
  moor: false,
  majorSupply: true,
})

beforeEach(() => {
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  vi.spyOn(window, 'matchMedia').mockImplementation(query => media(query === '(prefers-reduced-motion: reduce)' ? false : false))
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: { offsetTop: 0, height: 800 },
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('header-compact')) return box(0, 48)
    if (this.classList.contains('interaction-bar')) return box(700, 120)
    if (this.dataset.handAnchor === 'p1') return box(900, 180)
    if (this.dataset.handAnchor === 'p2') return box(300, 180)
    if (this.dataset.sectionTarget === 'farm' && !this.dataset.hiddenFarm) return box(80, 120)
    if (this.dataset.sectionTarget === 'public-farms') return box(1600, 400)
    return box(0, 0)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('section navigation targets', () => {
  it('offers only the sections that exist for this table', () => {
    expect(sectionNavItems({
      handPlayerId: 'p1',
      viewedFarm: true,
      publicFarms: true,
      seasons: true,
      moor: true,
      majorSupply: true,
    }).map(item => item.id)).toEqual(['hand', 'farm', 'public-farms', 'seasons', 'moor', 'major-supply'])

    expect(sectionNavItems({
      handPlayerId: null,
      viewedFarm: true,
      publicFarms: false,
      seasons: false,
      moor: false,
      majorSupply: true,
    }).map(item => item.id)).toEqual(['farm', 'major-supply'])
  })

  it('uses the existing section names in both languages', () => {
    const items = sectionNavItems({
      handPlayerId: 'p1', viewedFarm: true, publicFarms: true, seasons: true, moor: true, majorSupply: true,
    })
    expect(items.map(item => item.labelKey)).toEqual([
      'ui.handCards', 'ui.farmTitle', 'ui.publicFarms', 'ui.seasons.board', 'moor.specialActions.title', 'ui.majorImprovements',
    ])
    for (const item of items) {
      expect(t('en', item.labelKey)).not.toBe(item.labelKey)
      expect(t('zh', item.labelKey)).not.toBe(item.labelKey)
    }
    expect(items.find(item => item.id === 'hand')?.selector).toBe('[data-section-target="hand"][data-hand-anchor="p1"]')
  })

  it('keeps another player hand unavailable even when that hand is on screen in dev mode', () => {
    expect(ownHandSectionAvailable({
      selfPlayerId: 'p1', displayPlayerId: 'p2', visiblePlayerIds: ['p2'], devMode: true,
    })).toBeNull()
    expect(ownHandSectionAvailable({
      selfPlayerId: 'p1', displayPlayerId: 'p1', visiblePlayerIds: [], devMode: false,
    })).toBeNull()
    expect(ownHandSectionAvailable({
      selfPlayerId: null, displayPlayerId: 'p1', visiblePlayerIds: [], devMode: true,
    })).toBeNull()
    expect(ownHandSectionAvailable({
      selfPlayerId: 'p1', displayPlayerId: 'p1', visiblePlayerIds: ['p1'], devMode: false,
    })).toBe('p1')
    expect(ownHandSectionAvailable({
      selfPlayerId: 'p1', displayPlayerId: 'p1', visiblePlayerIds: [], devMode: true,
    })).toBe('p1')
  })
})

describe('SectionNav', () => {
  it('scrolls the named section below the sticky header without taking interaction focus', async () => {
    const user = userEvent.setup()
    const items = itemsFor()
    renderNav(items)
    const focused = document.querySelector('[data-interaction-focus="actions"]')!
    focused.setAttribute('data-interaction-focused', 'true')
    expect(document.activeElement).toBe(document.body)

    await user.click(screen.getByRole('button', { name: 'Hand Cards' }))

    const ownHand = document.querySelector('[data-hand-anchor="p1"]')!
    expect(window.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 900 - 48 - 12, behavior: 'smooth' })
    expect(ownHand).not.toHaveAttribute('data-interaction-focused')
    expect(ownHand).not.toHaveFocus()
    expect(focused).toHaveAttribute('data-interaction-focused', 'true')
    expect(screen.getByRole('button', { name: 'Hand Cards' })).toHaveFocus()
    expect(screen.getByRole('navigation', { name: sectionNavName('en', items) })).toBeVisible()
  })

  it('leaves a section that is already between the header and the action bar where it is', async () => {
    const user = userEvent.setup()
    renderNav(itemsFor())
    await user.click(screen.getByRole('button', { name: 'Player Farm' }))
    expect(window.scrollBy).not.toHaveBeenCalled()
  })

  it('does not scroll a covered or missing target and ignores another player hand', async () => {
    const user = userEvent.setup()
    renderNav(itemsFor())
    const covered = document.querySelector('[data-hidden-farm]') as HTMLElement
    scrollSectionIntoView(covered)
    expect(window.scrollBy).not.toHaveBeenCalled()

    render(<SectionNav locale="en" items={sectionNavItems({
      handPlayerId: 'p1', viewedFarm: false, publicFarms: false, seasons: true, moor: false, majorSupply: false,
    })} />)
    await user.click(screen.getByRole('button', { name: 'Seasons Board' }))
    expect(window.scrollBy).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Special Actions' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-hand-anchor="p2"]')).not.toHaveAttribute('data-interaction-focused')
  })

  it('offsets a shifted visual viewport and uses an instant jump when motion is reduced', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { offsetTop: 20, height: 800 },
    })
    vi.mocked(window.matchMedia).mockImplementation(query => media(query === '(prefers-reduced-motion: reduce)'))
    const node = document.createElement('section')
    document.body.append(node)
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(box(2000, 80))
    scrollSectionIntoView(node)
    expect(window.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 2000 - 20 - 12, behavior: 'instant' })
  })

  it('moves between shortcuts with the keyboard and does not focus them on mount', () => {
    renderNav(sectionNavItems({
      handPlayerId: null, viewedFarm: true, publicFarms: false, seasons: false, moor: false, majorSupply: true,
    }))
    const farm = screen.getByRole('button', { name: 'Player Farm' })
    const majors = screen.getByRole('button', { name: 'Major Improvements', exact: true })
    expect(document.activeElement).toBe(document.body)
    farm.focus()
    fireEvent.keyDown(farm, { key: 'ArrowRight' })
    expect(majors).toHaveFocus()
    fireEvent.keyDown(majors, { key: 'End' })
    expect(majors).toHaveFocus()
    fireEvent.keyDown(majors, { key: 'Home' })
    expect(farm).toHaveFocus()
    fireEvent.keyDown(farm, { key: 'ArrowLeft' })
    expect(farm).toHaveFocus()
  })

  it('stays fixed above the interaction bar, under overlays, and still on a narrow screen', () => {
    const css = readFileSync(resolve('client/app/SectionNav.css'), 'utf8')
    expect(css).toContain('position: fixed')
    expect(css).toContain('z-index: 40')
    expect(css).toContain('var(--interaction-bar-height')
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toContain('max-width: calc(100vw - 156px')
    expect(css).toContain('@media (max-width: 1100px)')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('--section-nav-height')
    expect(css).toContain('bottom: calc(max(var(--interaction-bar-height, 72px), var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))) + 8px)')
    expect(css).toContain('padding-bottom: calc(var(--app-edge-padding) + max(var(--interaction-bar-height, 0px), var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))) + var(--section-nav-height, 0px))')
  })

  it('scrolls a section that is clear of the action bar but still under the shortcut dock', () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('header-compact')) return box(0, 48)
      if (this.classList.contains('section-nav')) return box(640, 40)
      if (this.classList.contains('interaction-bar')) return box(700, 120)
      if (this.dataset.sectionTarget === 'farm' && !this.dataset.hiddenFarm) return box(600, 80)
      return box(0, 0)
    })
    renderNav(sectionNavItems({
      handPlayerId: null, viewedFarm: true, publicFarms: false, seasons: false, moor: false, majorSupply: false,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Player Farm' }))
    expect(window.scrollBy).toHaveBeenCalledWith({ top: 600 - 48 - 12, behavior: 'smooth' })
  })

  it('reserves dock space above the action bar so the page can scroll past the shortcuts', () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('section-nav')) return box(640, 44)
      return box(0, 0)
    })
    const view = renderNav(itemsFor())
    expect(view.container.querySelector('.app')).toHaveStyle({ '--section-nav-height': '52px' })
  })
})
