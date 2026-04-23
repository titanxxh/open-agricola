import { useEffect, useRef, useState, useCallback } from 'react'

export type SelectOption<T extends string> = {
  value: T
  label: string
  icon?: string
}

interface SelectButtonProps<T extends string> {
  value: T
  options: SelectOption<T>[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

export function SelectButton<T extends string>({
  value, options, onChange, size = 'md',
  placeholder, disabled, ariaLabel, className,
}: SelectButtonProps<T>) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  )
  const rootRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => (i + 1) % options.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => (i - 1 + options.length) % options.length); return }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onChange(options[activeIdx].value)
        close()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, options, activeIdx, onChange, close])

  const current = options.find((o) => o.value === value)
  const label = current?.label ?? placeholder ?? ''

  return (
    <div
      ref={rootRef}
      className={`select-button select-button--${size}${className ? ` ${className}` : ''}`}
    >
      <button
        type="button"
        className="select-button__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        {current?.icon && <span className="select-button__icon">{current.icon}</span>}
        <span className="select-button__label">{label}</span>
        <span className="select-button__caret" aria-hidden>▾</span>
      </button>
      {open && (
        <ul role="listbox" className="select-button__popover">
          {options.map((opt, idx) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`select-button__option${idx === activeIdx ? ' is-active' : ''}${opt.value === value ? ' is-selected' : ''}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => { onChange(opt.value); close() }}
            >
              {opt.icon && <span className="select-button__icon">{opt.icon}</span>}
              <span>{opt.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
