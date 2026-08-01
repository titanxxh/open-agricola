// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { applyWebsiteBackground } from '../seasonalBackground'

const STARTS = [
  ['2026-01-01', '22dongzhi'],
  ['2026-01-05', '23xiaohan'],
  ['2026-01-20', '24dahan'],
  ['2026-02-04', '01lichun'],
  ['2026-02-19', '02yushui'],
  ['2026-03-05', '03jingzhe'],
  ['2026-03-20', '04chunfeng'],
  ['2026-04-04', '05qingming'],
  ['2026-04-20', '06guyu'],
  ['2026-05-05', '07lixia'],
  ['2026-05-21', '08xiaoman'],
  ['2026-06-05', '09mangzhong'],
  ['2026-06-21', '10xiazhi'],
  ['2026-07-07', '11xiaoshu'],
  ['2026-07-23', '12dashu'],
  ['2026-08-07', '13liqiu'],
  ['2026-08-23', '14chushu'],
  ['2026-09-07', '15bailu'],
  ['2026-09-23', '16qiufen'],
  ['2026-10-08', '17hanlu'],
  ['2026-10-23', '18shuangjiang'],
  ['2026-11-07', '19lidong'],
  ['2026-11-22', '20xiaoxue'],
  ['2026-12-07', '21daxue'],
  ['2026-12-22', '22dongzhi'],
] as const

describe('website background', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('uses the fixed UTC+8 solar-term start dates', () => {
    for (const [date, variant] of STARTS) {
      applyWebsiteBackground('zh', new Date(`${date}T00:00:00+08:00`))
      expect(document.documentElement.style.getPropertyValue('--bg-monthly')).toContain(`/${variant}.webp`)
    }
  })
})
