import { useLayoutEffect, useRef } from 'react'

/** Keeps the dialog modal for as long as the component that renders it is mounted. */
export function useModalDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (!dialog?.open) return
      dialog.close()
      // WebKit lifts the page's inert state at its next style update, and focus() skips that update while any
      // stylesheet is still loading. It then refuses the focus the owner hands back; reading layout updates it now.
      void dialog.offsetWidth
    }
  }, [])

  return dialogRef
}
