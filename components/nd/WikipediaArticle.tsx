import { Fragment, type ReactNode } from 'react'
import type {
  WikipediaArticleDocument,
  WikipediaArticleNode,
  WikipediaInlineNode,
} from '@/lib/wikipedia/types'

const CC_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/'

interface Props {
  article: WikipediaArticleDocument
}

export default function WikipediaArticle({ article }: Props) {
  return (
    <div className="nd-wikipedia-article">
      {article.nodes.map((node, index) => (
        <Fragment key={index}>{renderBlock(node, String(index))}</Fragment>
      ))}
      <footer className="nd-wikipedia-article__footer">
        <a className="nd-wikipedia-article__footer-link" href={article.articleUrl} {...externalLink}>
          Оригинал статьи
        </a>
        <a className="nd-wikipedia-article__footer-link" href={article.historyUrl} {...externalLink}>
          История правок
        </a>
        <a className="nd-wikipedia-article__footer-link" href={CC_LICENSE_URL} {...externalLink}>
          CC BY-SA 4.0
        </a>
      </footer>
    </div>
  )
}

const externalLink = { target: '_blank', rel: 'noopener noreferrer' } as const

function renderBlock(node: WikipediaArticleNode, key: string): ReactNode {
  switch (node.type) {
    case 'heading': {
      const Heading = `h${node.level}` as 'h2' | 'h3' | 'h4'
      return <Heading className="nd-wikipedia-article__heading">{renderInline(node.children, key)}</Heading>
    }
    case 'paragraph':
      return <p className="nd-wikipedia-article__paragraph">{renderInline(node.children, key)}</p>
    case 'list':
      return node.ordered ? (
        <ol className="nd-wikipedia-article__list">
          {node.items.map((item, index) => (
            <li key={index}>{renderInline(item, `${key}-${index}`)}</li>
          ))}
        </ol>
      ) : (
        <ul className="nd-wikipedia-article__list">
          {node.items.map((item, index) => (
            <li key={index}>{renderInline(item, `${key}-${index}`)}</li>
          ))}
        </ul>
      )
    case 'quote':
      return <blockquote className="nd-wikipedia-article__quote">{renderInline(node.children, key)}</blockquote>
    case 'image':
      return (
        <figure className="nd-wikipedia-article__figure">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote Wikimedia host, no Next loader */}
          <img className="nd-wikipedia-article__image" src={node.src} alt={node.alt} loading="lazy" />
          {node.caption.length > 0 && (
            <figcaption className="nd-wikipedia-article__caption">{renderInline(node.caption, `${key}-cap`)}</figcaption>
          )}
          <div className="nd-wikipedia-article__attribution">
            <span>{node.attribution.artist}</span>
            <a href={node.attribution.licenseUrl} {...externalLink}>
              {node.attribution.licenseName}
            </a>
            <a href={node.attribution.descriptionUrl} {...externalLink}>
              Источник
            </a>
          </div>
        </figure>
      )
  }
}

function renderInline(nodes: WikipediaInlineNode[], key: string): ReactNode[] {
  return nodes.map((node, index) => {
    const childKey = `${key}-${index}`
    switch (node.type) {
      case 'text':
        return <Fragment key={childKey}>{node.value}</Fragment>
      case 'strong':
        return <strong key={childKey}>{renderInline(node.children, childKey)}</strong>
      case 'emphasis':
        return <em key={childKey}>{renderInline(node.children, childKey)}</em>
      case 'link':
        return (
          <a key={childKey} className="nd-wikipedia-article__link" href={node.href} {...externalLink}>
            {renderInline(node.children, childKey)}
          </a>
        )
    }
  })
}
