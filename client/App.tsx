import { useSyncExternalStore } from 'react'
import { PrereleaseBoundary } from './app/PrereleaseBoundary'
import { PrereleaseBanner } from './app/PrereleaseBanner'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './contexts/LocaleContext'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { AppLoadFailure } from './app/AppLoadFailure'
import { GameContextRouter } from './app/GameContextRouter'
import { InboxProvider } from './app/Inbox'
import { WebPushClickRouter } from './app/WebPushClickRouter'
import { PageRouter } from './app/PageRouter'
import { getBrowserReloadRequired, subscribeBrowserReload } from './services/browser-api'
import './styles/bootstrap-shell.css'

function App() {
  const reloadRequired = useSyncExternalStore(subscribeBrowserReload, getBrowserReloadRequired)
  return (
    <LocaleProvider>
      {reloadRequired ? <><PrereleaseBanner /><AppLoadFailure /></> : <PrereleaseBoundary>
        <GameContextRouter>
          <AppErrorBoundary fallback={<AppLoadFailure />}>
            <AuthProvider><InboxProvider><WebPushClickRouter /><PageRouter /></InboxProvider></AuthProvider>
          </AppErrorBoundary>
        </GameContextRouter>
      </PrereleaseBoundary>}
    </LocaleProvider>
  )
}

export default App
