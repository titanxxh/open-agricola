import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ActionReference } from '../../../shared/contract/action-reference'
import { t, type Locale } from '../../../shared/i18n'
import { ActionReferencePlayerCount } from '../../contexts/ActionReferenceContext'
import { StaticActionPreview } from './StaticActionPreview'
import './ActionTextReference.css'

export function ActionTextReference({ reference, locale }: { reference: ActionReference; locale: Locale }) {
  const playerCount = useContext(ActionReferencePlayerCount)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const open = portalRoot !== null
  const trigger = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pinned = useRef(false)
  const restoringFocus = useRef(false)
  const id = useId()
  const cancelHide = useCallback(() => { clearTimeout(hideTimer.current) }, [])
  const hideSoon = () => { if (pinned.current) return; cancelHide(); hideTimer.current = setTimeout(() => setPortalRoot(null), 160) }
  const show = () => { cancelHide(); setPortalRoot(trigger.current?.closest('dialog') ?? document.body) }
  const close = useCallback((restoreFocus = false) => {
    pinned.current = false
    cancelHide()
    setPortalRoot(null)
    if (restoreFocus) {
      restoringFocus.current = true
      trigger.current?.focus({ preventScroll: true })
      restoringFocus.current = false
    }
  }, [cancelHide])

  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return
    const floating = panel.current
    floating.showPopover?.()
    const place = () => {
      if (!trigger.current) return
      const rect = trigger.current.getBoundingClientRect()
      if (rect.bottom < 0 || rect.top > window.innerHeight) { close(); return }
      const width = floating.offsetWidth
      const height = floating.offsetHeight
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const top = rect.bottom + 8 + height <= window.innerHeight - 8
        ? rect.bottom + 8 : Math.max(8, rect.top - height - 8)
      floating.style.left = `${left}px`
      floating.style.top = `${top}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(floating)
    const scrolled = (event: Event) => {
      if (!(event.target instanceof Node) || !floating.contains(event.target)) place()
    }
    document.addEventListener('scroll', scrolled, true)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      document.removeEventListener('scroll', scrolled, true)
      window.removeEventListener('resize', place)
    }
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) close()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopPropagation(); close(true)
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape, true)
      cancelHide()
    }
  }, [open, close, cancelHide])
  useEffect(() => () => cancelHide(), [cancelHide])

  return <>
    <span ref={trigger} className="card-action-reference" data-action-reference={`${reference.kind}:${reference.ids.join(',')}`}
      role="button" tabIndex={0} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog"
      onPointerEnter={event => { if (event.pointerType !== 'touch') show() }} onPointerLeave={hideSoon}
      onPointerDown={event => event.stopPropagation()}
      onFocus={() => { if (!restoringFocus.current) show() }} onBlur={event => { if (!panel.current?.contains(event.relatedTarget)) hideSoon() }}
      onClick={event => { event.stopPropagation(); pinned.current = true; show() }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); show() }
      }}>{reference.label}</span>
    {portalRoot && createPortal(
      <div ref={panel} id={id} popover="manual" role="dialog" aria-label={reference.label} className="action-reference-preview"
        onPointerEnter={cancelHide} onPointerLeave={hideSoon} onFocus={cancelHide}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) hideSoon() }}
        onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
        <header><strong>{reference.label}</strong><button type="button" aria-label={t(locale, 'ui.close')}
          onClick={() => close(true)}>×</button></header>
        <StaticActionPreview reference={reference} locale={locale} playerCount={playerCount} />
      </div>, portalRoot)}
  </>
}
