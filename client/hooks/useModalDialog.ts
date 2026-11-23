import { useLayoutEffect, useRef } from 'react'

/**
 * Keeps the dialog modal for as long as the component that renders it is mounted, and hands focus back to the element
 * that had it when the dialog opened, however the dialog closed (Escape, its own buttons, or unmounting).
 */
export function useModalDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    const opener = document.activeElement
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      // WebKit lifts the page's inert state at its next style update, and focus() skips that update while any
      // stylesheet is still loading, so the focus the dialog or its owner hands back is dropped onto the body (#2004).
      // Reading layout updates style; focus that landed nowhere then goes back to the opener.
      void dialog.offsetWidth
      const focused = document.activeElement
      if (focused && focused !== document.body && !dialog.contains(focused)) return
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  return dialogRef
}
