import { useEffect, useRef, useState, type RefObject } from 'react'

const KOFI_SCRIPT_SRC = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js'

const AFDIAN_ICON_SRC = `${import.meta.env.BASE_URL}afdian.png`
const MOBILE_QUERY = '(max-width: 640px)'

declare global {
  interface Window {
    kofiWidgetOverlay?: { draw: (name: string, config: Record<string, string>) => void }
    __kofiWidgetDrawn?: boolean
  }
}

function setKofiWidgetVisible(visible: boolean) {
  document.body.classList.toggle('kofi-widget-hidden', !visible)
}

function drawKofiWidget() {
  if (window.__kofiWidgetDrawn) return
  if (!window.kofiWidgetOverlay) return
  window.kofiWidgetOverlay.draw('titanxxh', {
    'type': 'floating-chat',
    'floating-chat.donateButton.text': 'Support Me',
    'floating-chat.donateButton.background-color': '#00b9fe',
    'floating-chat.donateButton.text-color': '#fff',
  })
  window.__kofiWidgetDrawn = true
}

function useDonateVisible(sentinelRef: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    let observer: IntersectionObserver | undefined
    const setup = () => {
      observer?.disconnect()
      observer = undefined
      if (!mql.matches || !sentinelRef.current) {
        setVisible(true)
        return
      }
      observer = new IntersectionObserver(entries => {
        setVisible(entries[0].isIntersecting)
      })
      observer.observe(sentinelRef.current)
    }
    setup()
    mql.addEventListener('change', setup)
    return () => {
      observer?.disconnect()
      mql.removeEventListener('change', setup)
    }
  }, [sentinelRef])

  return visible
}

export function DonateWidgets() {
  const sentinelRef = useRef<HTMLSpanElement>(null)
  const visible = useDonateVisible(sentinelRef)

  useEffect(() => {
    const apply = () => {
      drawKofiWidget()
      setKofiWidgetVisible(visible)
    }
    if (window.kofiWidgetOverlay || window.__kofiWidgetDrawn) {
      apply()
      return () => setKofiWidgetVisible(false)
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${KOFI_SCRIPT_SRC}"]`)
    if (!script) {
      script = document.createElement('script')
      script.src = KOFI_SCRIPT_SRC
      script.async = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', apply)
    return () => {
      script.removeEventListener('load', apply)
      setKofiWidgetVisible(false)
    }
  }, [visible])

  return (
    <>
      <span ref={sentinelRef} className="donate-sentinel" aria-hidden />
      <a
        className={`afdian-float-btn${visible ? '' : ' is-hidden'}`}
        href="https://afdian.com/a/titanxxh"
        target="_blank"
        rel="noreferrer"
      >
        <img className="afdian-float-btn__icon" src={AFDIAN_ICON_SRC} alt="" />
        <span>支持titanxxh</span>
      </a>
    </>
  )
}
