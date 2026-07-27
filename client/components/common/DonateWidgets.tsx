import { useEffect, useState } from 'react'

const KOFI_SCRIPT_SRC = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js'

const AFDIAN_ICON_SRC = `${import.meta.env.BASE_URL}afdian.png`
const MOBILE_QUERY = '(max-width: 640px)'
const NEAR_BOTTOM_PX = 48

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

function useDonateVisible() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const update = () => {
      if (!mql.matches) {
        setVisible(true)
        return
      }
      const el = document.scrollingElement || document.documentElement
      setVisible(el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    mql.addEventListener('change', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      mql.removeEventListener('change', update)
    }
  }, [])

  return visible
}

export function DonateWidgets() {
  const visible = useDonateVisible()

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
    <a
      className={`afdian-float-btn${visible ? '' : ' is-hidden'}`}
      href="https://afdian.com/a/titanxxh"
      target="_blank"
      rel="noreferrer"
    >
      <img className="afdian-float-btn__icon" src={AFDIAN_ICON_SRC} alt="" />
      <span>支持titanxxh</span>
    </a>
  )
}
