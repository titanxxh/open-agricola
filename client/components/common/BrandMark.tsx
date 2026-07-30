import { buildPlatformPageUrl } from '../../utils/platform-page-url'

type BrandMarkProps = {
  title: string
  titleAs?: 'h1' | 'h2' | 'div'
  className?: string
  titleClassName?: string
  imageClassName?: string
  homeLinkLabel?: string
}

const BRAND_LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`

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
        src={BRAND_LOGO_SRC}
        alt="Open Agricola logo"
      />
      <TitleTag className={titleClassName}>{title}</TitleTag>
    </>
  )

  if (homeLinkLabel) {
    return (
      <a
        className={`brand-mark brand-mark-home ${className}`.trim()}
        href={buildPlatformPageUrl('lobby')}
        aria-label={homeLinkLabel}
        title={homeLinkLabel}
      >
        {content}
      </a>
    )
  }

  return <div className={`brand-mark ${className}`.trim()}>{content}</div>
}
