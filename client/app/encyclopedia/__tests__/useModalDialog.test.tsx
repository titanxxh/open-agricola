// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useModalDialog } from '../useModalDialog'

const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
const close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = showModal
  HTMLDialogElement.prototype.close = close
})
afterEach(() => {
  showModal.mockClear()
  close.mockClear()
})

function Modal({ onClose }: { onClose?: (dialog: HTMLDialogElement | null) => void }) {
  const dialogRef = useModalDialog()
  return (
    <dialog ref={dialogRef} aria-label="Modal">
      <button type="button" onClick={() => onClose?.(dialogRef.current)}>Close</button>
    </dialog>
  )
}

describe('useModalDialog', () => {
  it('opens the dialog as a modal on mount and closes it on unmount', () => {
    const { getByRole, unmount } = render(<Modal />)
    const dialog = getByRole('dialog', { hidden: true })

    expect(showModal.mock.contexts).toEqual([dialog])
    expect(dialog).toHaveAttribute('open')

    unmount()
    expect(close.mock.contexts).toEqual([dialog])
    expect(dialog).not.toHaveAttribute('open')
  })

  it('does not close again on unmount a dialog its owner already closed', () => {
    const { getByRole, unmount } = render(<Modal onClose={(dialog) => dialog?.close()} />)
    getByRole('button', { name: 'Close', hidden: true }).click()
    expect(close).toHaveBeenCalledTimes(1)

    unmount()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('leaves exactly one modal open after a strict-mode remount', () => {
    const { getByRole } = render(<StrictMode><Modal /></StrictMode>)

    expect(getByRole('dialog', { hidden: true })).toHaveAttribute('open')
    expect(showModal.mock.calls.length - close.mock.calls.length).toBe(1)
  })
})
