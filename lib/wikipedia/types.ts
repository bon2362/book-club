export interface WikipediaTarget {
  language: string
  title: string
  articleUrl: string
}

export type WikipediaInlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: WikipediaInlineNode[] }
  | { type: 'emphasis'; children: WikipediaInlineNode[] }
  | { type: 'link'; href: string; children: WikipediaInlineNode[] }

export interface WikipediaImageAttribution {
  artist: string
  licenseName: string
  licenseUrl: string
  descriptionUrl: string
}

export type WikipediaArticleNode =
  | { type: 'heading'; level: 2 | 3 | 4; children: WikipediaInlineNode[] }
  | { type: 'paragraph'; children: WikipediaInlineNode[] }
  | { type: 'list'; ordered: boolean; items: WikipediaInlineNode[][] }
  | { type: 'quote'; children: WikipediaInlineNode[] }
  | {
      type: 'image'
      src: string
      alt: string
      caption: WikipediaInlineNode[]
      attribution: WikipediaImageAttribution
    }

export interface WikipediaArticleDocument {
  language: string
  title: string
  articleUrl: string
  historyUrl: string
  revisionId: number
  revisionTimestamp: string
  nodes: WikipediaArticleNode[]
}

export type WikipediaArticleErrorCode =
  | 'invalid_url'
  | 'not_found'
  | 'rate_limited'
  | 'timeout'
  | 'article_too_large'
  | 'upstream_error'

export class WikipediaArticleError extends Error {
  constructor(
    public readonly code: WikipediaArticleErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'WikipediaArticleError'
  }
}
