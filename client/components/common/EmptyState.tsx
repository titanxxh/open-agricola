import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  variant?: 'default' | 'compact'
  className?: string
}

export function EmptyState({
  icon, title, description, action,
  variant = 'default', className,
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state empty-state--${variant}${className ? ` ${className}` : ''}`}
      aria-label="empty state"
    >
      <div className="empty-state__icon" aria-hidden>
        {icon ?? '📦'}
      </div>
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__desc">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}
