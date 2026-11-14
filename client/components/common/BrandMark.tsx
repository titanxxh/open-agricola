import { buildPlatformPageUrl } from '../../utils/platform-page-url'
import brandLogo from '../../assets/brand-logo.png'

type BrandMarkProps = {
  title: string
  titleAs?: 'h1' | 'h2' | 'div'
  className?: string
  titleClassName?: string
  imageClassName?: string
  homeLinkLabel?: string
}

export function BrandMark({
  title,
  titleAs = 'div',
  className = '',
  titleClassName = '',
  imageClassName = '',
  homeLinkLabel,
}: BrandMarkProps) {
  const TitleTag = titleAs
  const content = (
    <>
      <img
        className={`brand-mark-image ${imageClassName}`.trim()}
        src={brandLogo}
        alt="Open Agricola logo"
        width={128}
        height={128}
      />
      <TitleTag className={titleClassName}>{title}</TitleTag>
    </>
  )

  if (homeLinkLabel) {
    return (
      <a
        className={`brand-mark brand-mark-home ${className}`.trim()}
        href={buildPlatformPageUrl('lobby')}
        aria-label={`${title}: ${homeLinkLabel}`}
        title={homeLinkLabel}
      >
        {content}
      </a>
    )
  }

  return <div className={`brand-mark ${className}`.trim()}>{content}</div>
}
