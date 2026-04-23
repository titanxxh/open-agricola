import { useState, type ReactNode } from 'react'

interface DangerButtonProps {
  children: ReactNode
  confirmText?: string
  onConfirm: () => void | Promise<void>
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}

export function DangerButton({
  children, confirmText, onConfirm,
  size = 'md', disabled, className,
}: DangerButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (disabled || loading) return
    if (confirmText) {
      setShowConfirm(true)
      return
    }
    await runConfirm()
  }

  async function runConfirm() {
    setLoading(true)
    try { await onConfirm() } finally {
      setLoading(false)
      setShowConfirm(false)
    }
  }

  return (
    <span className={`danger-button danger-button--${size}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="danger-button__trigger"
        disabled={disabled || loading}
        onClick={handleClick}
      >
        {loading ? '...' : children}
      </button>
      {showConfirm && (
        <div role="dialog" className="danger-button__confirm">
          <p className="danger-button__confirm-text">{confirmText}</p>
          <div className="danger-button__confirm-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowConfirm(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="danger-button__trigger"
              onClick={runConfirm}
              disabled={loading}
            >
              确认
            </button>
          </div>
        </div>
      )}
    </span>
  )
}
