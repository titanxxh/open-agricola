import { AuthProvider } from './contexts/AuthContext'
import { PageRouter } from './app/PageRouter'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <PageRouter />
    </AuthProvider>
  )
}

export default App
