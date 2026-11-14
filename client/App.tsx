import { useSyncExternalStore } from 'react'
import { PrereleaseBoundary } from './app/PrereleaseBoundary'
import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './contexts/LocaleContext'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { AppLoadFailure } from './app/AppLoadFailure'
import { GameContextRouter } from './app/GameContextRouter'
import { PageRouter } from './app/PageRouter'
import { getBrowserReloadRequired, subscribeBrowserReload } from './services/browser-api'
import './styles/bootstrap-shell.css'

function App() {
  const reloadRequired = useSyncExternalStore(subscribeBrowserReload, getBrowserReloadRequired)
  return (
    <LocaleProvider>
      <PrereleaseBoundary>{reloadRequired ? <AppLoadFailure /> : <GameContextRouter>
        <AppErrorBoundary fallback={<AppLoadFailure />}>
          <AuthProvider><PageRouter /></AuthProvider>
        </AppErrorBoundary>
      </GameContextRouter>}</PrereleaseBoundary>
    </LocaleProvider>
  )
}

export default App
