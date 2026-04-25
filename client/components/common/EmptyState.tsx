import type { ReactNode } from 'react'
import { EmptyArt, type EmptyArtName } from './EmptyArt'

interface EmptyStateProps {
  icon?: ReactNode
  /** Named SVG illustration. Takes precedence over icon when provided. */
  art?: EmptyArtName
  title: string
  description?: string
  action?: ReactNode
  variant?: 'default' | 'compact'
  className?: string
}

export function EmptyState({
  icon, art, title, description, action,
  variant = 'default', className,
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state empty-state--${variant}${art ? ' empty-state--art' : ''}${className ? ` ${className}` : ''}`}
      aria-label="empty state"
    >
      <div className="empty-state__icon" aria-hidden>
        {art ? <EmptyArt name={art} /> : (icon ?? '📦')}
      </div>
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__desc">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}
