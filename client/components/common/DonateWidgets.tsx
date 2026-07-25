import { useEffect } from 'react'

const KOFI_SCRIPT_SRC = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js'
const KOFI_WIDGET_SELECTOR = [
  '.floatingchat-container-wrap',
  '.floatingchat-container-wrap-mobi',
  '.floating-chat-kofi-popup-iframe',
  '.floating-chat-kofi-popup-iframe-mobi',
].join(', ')

const AFDIAN_ICON_SRC = `${import.meta.env.BASE_URL}afdian.png`

declare global {
  interface Window {
    kofiWidgetOverlay?: { draw: (name: string, config: Record<string, string>) => void }
    __kofiWidgetDrawn?: boolean
  }
}

function setKofiWidgetVisible(visible: boolean) {
  document.querySelectorAll<HTMLElement>(KOFI_WIDGET_SELECTOR).forEach(el => {
    el.style.display = visible ? '' : 'none'
  })
}

function drawKofiWidget() {
  if (window.__kofiWidgetDrawn) {
    setKofiWidgetVisible(true)
    return
  }
  if (!window.kofiWidgetOverlay) return
  window.kofiWidgetOverlay.draw('titanxxh', {
    'type': 'floating-chat',
    'floating-chat.donateButton.text': 'Support Me',
    'floating-chat.donateButton.background-color': '#00b9fe',
    'floating-chat.donateButton.text-color': '#fff',
  })
  window.__kofiWidgetDrawn = true
}

export function DonateWidgets() {
  useEffect(() => {
    if (window.kofiWidgetOverlay || window.__kofiWidgetDrawn) {
      drawKofiWidget()
      return () => setKofiWidgetVisible(false)
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${KOFI_SCRIPT_SRC}"]`)
    if (!script) {
      script = document.createElement('script')
      script.src = KOFI_SCRIPT_SRC
      script.async = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', drawKofiWidget)
    return () => {
      script.removeEventListener('load', drawKofiWidget)
      setKofiWidgetVisible(false)
    }
  }, [])

  return (
    <a
      className="afdian-float-btn"
      href="https://afdian.com/a/titanxxh"
      target="_blank"
      rel="noreferrer"
    >
      <img className="afdian-float-btn__icon" src={AFDIAN_ICON_SRC} alt="" />
      <span>支持titanxxh</span>
    </a>
  )
}
