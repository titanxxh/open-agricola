import type { Locale } from '../../../shared/i18n'
import type { CardMeta } from '../../services/card-meta'
import {
  isScanSkin,
  type ScanCard,
  type ScanSkinCard,
} from '../../../shared/scan-cards'
import { PlayerCard } from '../common/PlayerCard'
import { ScanText } from './ScanText'
import { AlienArtifactCard } from './AlienArtifactCard'
import { AlienEventCard, SpaceMerchantCard } from './XBandCard'
import { CropCirclesCard } from './CropCirclesCard'
import { ExpansionRulesCard } from './ExpansionRulesCard'
import { ForestEventCard } from './ForestEventCard'
import { GuestCard } from './GuestCard'
import { IllustratedActionCard } from './IllustratedActionCard'
import { LandscapeEventCard } from './LandscapeEventCard'
import { OffspringCard } from './OffspringCard'

export const scanSkinMeta = (card: ScanSkinCard): CardMeta => ({
  authored: true,
  id: card.id,
  name: card.name,
  deck: card.deck,
  number: Number(card.number.replace(/\D/g, '')) || 0,
  type: card.layout,
  desc: [card.text],
  cost: card.cost,
  players: card.players,
  prerequisite: card.prerequisite,
  vp: card.vp,
  isCookery: card.isCookery,
  category: card.category,
  scanDeck: card.deck,
  scanNumber: card.number,
  scanArt: card.art,
  scanOverlay: card.overlay,
})

export function ScanCardFace({ card, locale }: { card: ScanCard; locale: Locale }) {
  if (isScanSkin(card)) {
    return (
      <PlayerCard
        locale={locale}
        cardId={card.id}
        cardType={card.layout}
        cardMeta={scanSkinMeta(card)}
        enablePreview={false}
        renderText={(text) => <ScanText text={text} />}
      />
    )
  }
  switch (card.layout) {
    case 'alien-artifact':
      return <AlienArtifactCard card={card} locale={locale} />
    case 'illustrated-action':
      return <IllustratedActionCard card={card} locale={locale} />
    case 'space-merchant':
      return <SpaceMerchantCard card={card} locale={locale} />
    case 'alien-event':
      return <AlienEventCard card={card} locale={locale} />
    case 'event':
      return <ForestEventCard card={card} locale={locale} />
    case 'landscape-event':
      return <LandscapeEventCard card={card} locale={locale} />
    case 'offspring':
      return <OffspringCard card={card} locale={locale} />
    case 'guest':
      return <GuestCard card={card} locale={locale} />
    case 'crop-circles':
      return <CropCirclesCard card={card} locale={locale} />
    case 'expansion-rules':
      return <ExpansionRulesCard card={card} locale={locale} />
  }
}
