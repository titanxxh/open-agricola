import { GameContainer } from './app/GameContainer'
import { GameContainerApi } from './app/GameContainerApi'
import './App.css'

const useApiMode = new URLSearchParams(window.location.search).get('mode') !== 'local'

function App() {
  return useApiMode ? <GameContainerApi /> : <GameContainer />
}

export default App
