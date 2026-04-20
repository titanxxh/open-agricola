import { AuthProvider } from './contexts/AuthContext'
import { LocaleProvider } from './contexts/LocaleContext'
import { PageRouter } from './app/PageRouter'
import './App.css'

function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <PageRouter />
      </AuthProvider>
    </LocaleProvider>
  )
}

export default App
