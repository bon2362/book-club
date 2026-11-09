import type { MetadataRoute } from 'next'

/**
 * robots.txt. Статический (собирается при билде, базу не трогает).
 *
 * - Поисковикам открыт публичный контент; закрыты API, админка, служебные
 *   страницы и страницы, которые без входа всё равно пустые или личные.
 * - SEO-краулерам, которые не приводят читателей, закрыт весь сайт: они
 *   ходили круглосуточно и будили базу (разбор расхода Neon 2026-11-09).
 *   Это просьба, а не защита: плохие боты robots.txt игнорируют. Самый
 *   шумный (TernCrawler) дополнительно заблокирован правилом Vercel Firewall.
 */
export const SEO_CRAWLERS_DISALLOWED = [
  'TernCrawler',
  'MJ12bot',
  'SERankingBacklinksBot',
  'DomainMetaDataBot',
  'webXtrendBot',
  'AhrefsBot',
  'SemrushBot',
  'DotBot',
  'BLEXBot',
  'PetalBot',
] as const

export const PRIVATE_PATHS = [
  '/api/',
  '/admin',
  '/calendar/',
  '/matching',
  '/collections/new',
  '/styleguide',
  '/vibe',
  '/*/edit',
] as const

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: [...SEO_CRAWLERS_DISALLOWED], disallow: '/' },
      { userAgent: '*', allow: '/', disallow: [...PRIVATE_PATHS] },
    ],
  }
}
