import { useCallback, useRef } from 'react'

export type CardPlayOutcome = void | boolean | Promise<boolean>

export const useCardPlayChoice = (requestKey: string, resolveChoice: (value: string) => CardPlayOutcome) => {
  const submittedRequestRef = useRef<{ requestKey: string } | null>(null)
  return useCallback((cardId: string) => {
    if (submittedRequestRef.current?.requestKey === requestKey) return false
    const attempt = { requestKey }
    submittedRequestRef.current = attempt
    const settle = (accepted: boolean) => {
      if (!accepted && submittedRequestRef.current === attempt) submittedRequestRef.current = null
      return accepted
    }
    try {
      const result = resolveChoice(cardId)
      return result instanceof Promise
        ? result.then(settle, () => settle(false))
        : settle(result !== false)
    } catch {
      return settle(false)
    }
  }, [requestKey, resolveChoice])
}
