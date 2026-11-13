import { t, type Locale } from '../../shared/i18n'

export type SectionNavId = 'hand' | 'farm' | 'public-farms' | 'seasons' | 'moor' | 'major-supply'

export type SectionNavItem = {
  id: SectionNavId
  labelKey: string
  selector: string
}

export type SectionNavAvailability = {
  handPlayerId: string | null
  viewedFarm: boolean
  publicFarms: boolean
  seasons: boolean
  moor: boolean
  majorSupply: boolean
}

const PLAY_INSET = 12

export function ownHandSectionAvailable(input: {
  selfPlayerId: string | null
  displayPlayerId: string | null
  visiblePlayerIds: readonly string[]
  devMode: boolean
}): string | null {
  const { selfPlayerId, displayPlayerId, visiblePlayerIds, devMode } = input
  if (!selfPlayerId || selfPlayerId !== displayPlayerId) return null
  if (!visiblePlayerIds.includes(selfPlayerId) && !devMode) return null
  return selfPlayerId
}

export function sectionNavItems(availability: SectionNavAvailability): SectionNavItem[] {
  const items: SectionNavItem[] = []
  if (availability.handPlayerId) {
    items.push({
      id: 'hand',
      labelKey: 'ui.handCards',
      selector: `[data-section-target="hand"][data-hand-anchor="${CSS.escape(availability.handPlayerId)}"]`,
    })
  }
  if (availability.viewedFarm) items.push({ id: 'farm', labelKey: 'ui.farmTitle', selector: '[data-section-target="farm"]' })
  if (availability.publicFarms) items.push({ id: 'public-farms', labelKey: 'ui.publicFarms', selector: '[data-section-target="public-farms"]' })
  if (availability.seasons) items.push({ id: 'seasons', labelKey: 'ui.seasons.board', selector: '[data-section-target="seasons"]' })
  if (availability.moor) items.push({ id: 'moor', labelKey: 'moor.specialActions.title', selector: '[data-section-target="moor"]' })
  if (availability.majorSupply) items.push({ id: 'major-supply', labelKey: 'ui.majorImprovements', selector: '[data-section-target="major-supply"]' })
  return items
}

export function sectionNavName(locale: Locale, items: readonly SectionNavItem[]): string {
  return items.map(item => t(locale, item.labelKey)).join(t(locale, 'ui.listSeparator'))
}

export function findSectionTarget(selector: string): HTMLElement | null {
  return Array.from(document.querySelectorAll(selector)).find((candidate): candidate is HTMLElement =>
    candidate instanceof HTMLElement && !candidate.closest('[hidden]')) ?? null
}

export function scrollSectionIntoView(node: HTMLElement): void {
  if (node.closest('[hidden]')) return
  const viewport = window.visualViewport
  const viewportOffset = viewport?.offsetTop ?? 0
  const app = node.closest('.app')
  const header = app?.querySelector<HTMLElement>('.header-compact')
  const viewportTop = viewportOffset + (header?.getBoundingClientRect().height ?? 0) + PLAY_INSET
  const bar = app?.querySelector<HTMLElement>('.interaction-bar')
  const viewportBottom = Math.min(
    viewportOffset + (viewport?.height ?? window.innerHeight),
    bar?.getBoundingClientRect().top ?? window.innerHeight,
  ) - PLAY_INSET
  const bounds = node.getBoundingClientRect()
  if (bounds.top >= viewportTop && bounds.bottom <= viewportBottom) return
  const top = bounds.top - viewportTop
  if (Math.abs(top) < 1) return
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  window.scrollBy({ top, behavior: reduced ? 'instant' : 'smooth' })
}
