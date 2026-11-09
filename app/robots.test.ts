import robots, { PRIVATE_PATHS, SEO_CRAWLERS_DISALLOWED } from './robots'

describe('robots.txt', () => {
  const { rules } = robots()
  const list = Array.isArray(rules) ? rules : [rules]

  it('шумным SEO-краулерам закрыт весь сайт', () => {
    const seo = list.find((rule) => Array.isArray(rule.userAgent) && rule.userAgent.includes('TernCrawler'))
    expect(seo?.disallow).toBe('/')
    expect(seo?.userAgent).toEqual([...SEO_CRAWLERS_DISALLOWED])
  })

  it('поисковикам открыт публичный контент, закрыты служебные пути', () => {
    const all = list.find((rule) => rule.userAgent === '*')
    expect(all?.allow).toBe('/')
    expect(all?.disallow).toEqual([...PRIVATE_PATHS])
    expect(PRIVATE_PATHS).toEqual(expect.arrayContaining(['/api/', '/admin']))
  })

  it('не закрывает главную и публичные разделы', () => {
    for (const path of PRIVATE_PATHS) {
      expect(path).not.toBe('/')
      for (const publicPath of ['/books/', '/collections', '/timeline', '/summaries/']) {
        expect(path === publicPath || (path.endsWith('/') && publicPath.startsWith(path))).toBe(false)
      }
    }
  })

  it('Googlebot и Яндекс не попадают в список закрытых', () => {
    expect(SEO_CRAWLERS_DISALLOWED).not.toContain('Googlebot')
    expect(SEO_CRAWLERS_DISALLOWED).not.toContain('YandexBot')
  })
})
