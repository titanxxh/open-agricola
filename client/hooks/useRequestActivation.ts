import { useState } from 'react'

export type RequestActivation = Readonly<{ requestKey: string | null }>

export const useRequestActivation = (requestKey: string | null): RequestActivation => {
  const [activation, setActivation] = useState<RequestActivation>(() => ({ requestKey }))
  if (activation.requestKey === requestKey) return activation
  const next = { requestKey }
  setActivation(next)
  return next
}
