import { useState, type ReactNode } from 'react'
import { t, type Locale } from '../../../shared/i18n'

interface SectionProps {
  title?: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  /**
   * Visual hierarchy — pick by importance, not by aesthetic preference:
   * - `sandbox`  — the page's hero card (only one per page)
   * - `parchment` — primary content cards
   * - `secondary` — supporting cards that should not compete with primary
   * - `danger`   — destructive operations
   * - `default`  — neutral white card (game sidebar / inline panels)
   */
  variant?: 'default' | 'parchment' | 'sandbox' | 'secondary' | 'danger'
  collapsible?: boolean
  /** When true, collapse only on small viewports — desktop always shows body. */
  mobileCollapsible?: boolean
  defaultCollapsed?: boolean
  locale?: Locale
  className?: string
  children: ReactNode
}

export function Section({
  title, subtitle, icon, actions,
  variant = 'default', collapsible = false, mobileCollapsible = false,
  defaultCollapsed = false, locale = 'en',
  className, children,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const showToggle = collapsible || mobileCollapsible
  // For desktop-collapsible we unmount the body (matches old behavior); for
  // mobile-only we keep it mounted so CSS can show it on >640px.
  const hideBodyInDom = collapsible && collapsed
  const sectionClass = [
    'section',
    `section--${variant}`,
    collapsed ? 'is-collapsed' : '',
    mobileCollapsible ? 'section--mobile-collapsible' : '',
    className ?? '',
  ].filter(Boolean).join(' ')
  return (
    <section className={sectionClass}>
      {(title || actions) && (
        <header className="section__header">
          <div className="section__heading">
            {icon && <span className="section__icon" aria-hidden>{icon}</span>}
            {title && <h2 className="section__title">{title}</h2>}
            {subtitle && <p className="section__subtitle">{subtitle}</p>}
          </div>
          {(actions || showToggle) && (
            <div className="section__actions">
              {actions}
              {showToggle && (
                <button
                  type="button"
                  className="section__toggle"
                  aria-label={t(locale, collapsed ? 'ui.expandSection' : 'ui.collapseSection')}
                  aria-expanded={!collapsed}
                  onClick={() => setCollapsed((v) => !v)}
                >
                  {collapsed ? '▸' : '▾'}
                </button>
              )}
            </div>
          )}
        </header>
      )}
      {!hideBodyInDom && <div className="section__body">{children}</div>}
    </section>
  )
}
