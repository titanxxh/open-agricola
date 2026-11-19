import { useSyncExternalStore } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './contexts/LocaleContext'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { AppLoadFailure } from './app/AppLoadFailure'
import { GameContextRouter } from './app/GameContextRouter'
import { InboxProvider } from './app/Inbox'
import { PageRouter } from './app/PageRouter'
import { getBrowserReloadRequired, subscribeBrowserReload } from './services/browser-api'
import './styles/bootstrap-shell.css'

function App() {
  const reloadRequired = useSyncExternalStore(subscribeBrowserReload, getBrowserReloadRequired)
  return (
    <LocaleProvider>
      {reloadRequired ? <AppLoadFailure /> : <GameContextRouter>
        <AppErrorBoundary fallback={<AppLoadFailure />}>
          <AuthProvider><InboxProvider><PageRouter /></InboxProvider></AuthProvider>
        </AppErrorBoundary>
      </GameContextRouter>}
    </LocaleProvider>
  )
}

export default App
