import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../client/styles/tokens.css'
import '../../client/styles/base.css'
import '../../client/styles/components.css'
import '../../client/styles/pages/game.css'
import '../../client/styles/card-sprite.css'
import { loadCardsManifest } from '../../client/services/card-meta'
import { ReplayViewer } from './ReplayViewer'
import './styles.css'

void loadCardsManifest()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReplayViewer />
  </StrictMode>,
)
