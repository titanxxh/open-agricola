import { createContext } from 'react'

/** Absent in standalone browsing, where all printed versions are relevant. */
export const ActionReferencePlayerCount = createContext<number | undefined>(undefined)
