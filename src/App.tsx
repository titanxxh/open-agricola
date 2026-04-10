import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './contexts/LocaleContext'
import { LocaleSwitcher } from './components/common/LocaleSwitcher'
import { PageRouter } from './app/PageRouter'
import './App.css'

const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === '1'

function App() {
  return (
    <LocaleProvider>
      {!isEmbedded && <LocaleSwitcher className="global-locale-switcher" />}
      <AuthProvider>
        <PageRouter />
      </AuthProvider>
    </LocaleProvider>
  )
}

export default App
