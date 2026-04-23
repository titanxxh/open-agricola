import { useState, type ReactNode } from 'react'

interface SectionProps {
  title?: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  variant?: 'default' | 'parchment' | 'sandbox'
  collapsible?: boolean
  defaultCollapsed?: boolean
  className?: string
  children: ReactNode
}

export function Section({
  title, subtitle, icon, actions,
  variant = 'default', collapsible = false, defaultCollapsed = false,
  className, children,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  return (
    <section className={`section section--${variant}${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <header className="section__header">
          <div className="section__heading">
            {icon && <span className="section__icon" aria-hidden>{icon}</span>}
            {title && <h2 className="section__title">{title}</h2>}
            {subtitle && <p className="section__subtitle">{subtitle}</p>}
          </div>
          {(actions || collapsible) && (
            <div className="section__actions">
              {actions}
              {collapsible && (
                <button
                  type="button"
                  className="section__toggle"
                  aria-label={collapsed ? 'expand' : 'collapse'}
                  onClick={() => setCollapsed((v) => !v)}
                >
                  {collapsed ? '▸' : '▾'}
                </button>
              )}
            </div>
          )}
        </header>
      )}
      {!collapsed && <div className="section__body">{children}</div>}
    </section>
  )
}
