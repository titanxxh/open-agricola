import { useCallback, useRef } from 'react'
import { useRequestActivation, type RequestActivation } from './useRequestActivation'

export type CardPlayOutcome = void | boolean | Promise<boolean>

export const useCardPlayChoice = (requestKey: string, resolveChoice: (value: string) => CardPlayOutcome) => {
  const activation = useRequestActivation(requestKey)
  const submittedRequestRef = useRef<{ activation: RequestActivation } | null>(null)
  return useCallback((cardId: string) => {
    if (submittedRequestRef.current?.activation === activation) return false
    const attempt = { activation }
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
  }, [activation, resolveChoice])
}
