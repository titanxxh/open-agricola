import { useCallback, useRef } from 'react'

export const useCardPlayChoice = (requestKey: string, resolveChoice: (value: string) => void) => {
  const submittedRequestRef = useRef<string | null>(null)
  return useCallback((cardId: string) => {
    if (submittedRequestRef.current === requestKey) return
    submittedRequestRef.current = requestKey
    resolveChoice(cardId)
  }, [requestKey, resolveChoice])
}
