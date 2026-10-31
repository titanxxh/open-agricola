import { useLayoutEffect, useRef } from 'react'

/** Keeps the dialog modal for as long as the component that renders it is mounted. */
export function useModalDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  return dialogRef
}
