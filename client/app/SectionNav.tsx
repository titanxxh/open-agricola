import type { KeyboardEvent } from 'react'
import { t, type Locale } from '../../shared/i18n'
import { findSectionTarget, scrollSectionIntoView, sectionNavName, type SectionNavItem } from './section-nav'
import './SectionNav.css'

type Props = {
  locale: Locale
  items: readonly SectionNavItem[]
}

const focusShortcut = (current: HTMLButtonElement, key: string): boolean => {
  const buttons = Array.from(current.closest('nav')?.querySelectorAll<HTMLButtonElement>('button') ?? [])
  const index = buttons.indexOf(current)
  if (index < 0) return false
  const next = key === 'Home' ? 0
    : key === 'End' ? buttons.length - 1
      : key === 'ArrowRight' || key === 'ArrowDown' ? Math.min(index + 1, buttons.length - 1)
        : key === 'ArrowLeft' || key === 'ArrowUp' ? Math.max(index - 1, 0)
          : null
  if (next === null) return false
  const button = buttons[next]
  if (!button) return false
  button.focus({ preventScroll: true })
  const nav = button.closest<HTMLElement>('.section-nav')
  if (nav) {
    const navRect = nav.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    if (buttonRect.left < navRect.left) nav.scrollBy({ left: buttonRect.left - navRect.left - 8 })
    else if (buttonRect.right > navRect.right) nav.scrollBy({ left: buttonRect.right - navRect.right + 8 })
  }
  return true
}

export function SectionNav({ locale, items }: Props) {
  if (items.length === 0) return null
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLButtonElement)) return
    if (!focusShortcut(event.target, event.key)) return
    event.preventDefault()
  }
  return (
    <nav className="section-nav" aria-label={sectionNavName(locale, items)} onKeyDown={onKeyDown}>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          className="section-nav__jump"
          onClick={() => {
            const node = findSectionTarget(item.selector)
            if (node) scrollSectionIntoView(node)
          }}
        >
          {t(locale, item.labelKey)}
        </button>
      ))}
    </nav>
  )
}
