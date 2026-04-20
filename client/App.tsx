import { useEffect, useState } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './contexts/LocaleContext'
import { PageRouter } from './app/PageRouter'
import { loadCardsManifest } from './services/card-meta'
import './App.css'

function App() {
  const [manifestReady, setManifestReady] = useState(false)
  const [manifestError, setManifestError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadCardsManifest()
      .then(() => {
        if (!cancelled) setManifestReady(true)
      })
      .catch((err: Error) => {
        if (!cancelled) setManifestError(err.message ?? String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (manifestError) {
    return (
      <div className="app-bootstrap-error">
        Failed to load card metadata: {manifestError}
      </div>
    )
  }

  if (!manifestReady) {
    return <div className="app-bootstrap-loading">Loading cards…</div>
  }

  return (
    <LocaleProvider>
      <AuthProvider>
        <PageRouter />
      </AuthProvider>
    </LocaleProvider>
  )
}

export default App
