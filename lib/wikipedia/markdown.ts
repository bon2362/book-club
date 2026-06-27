import type { Blockquote, Link, Paragraph, Root, RootContent } from 'mdast'
import { parseWikipediaUrl } from './url'

export function remarkWikipediaEmbeds() {
  return (tree: Root) => {
    visitBlockquotes(tree, markEmbed)
  }
}

function markEmbed(node: Blockquote): void {
  if (node.children.length < 2) return
  const sourceParagraph = node.children.at(-1)
  if (sourceParagraph?.type !== 'paragraph') return
  const link = getSourceLink(sourceParagraph)
  if (!link || link.title?.toLowerCase() !== 'wikipedia') return

  try {
    const target = parseWikipediaUrl(link.url)
    node.children = node.children.slice(0, -1)
    node.data = {
      ...node.data,
      hName: 'aside',
      hProperties: {
        'data-wikipedia-embed': 'true',
        'data-wikipedia-source': target.articleUrl,
      },
    }
  } catch {
    return
  }
}

function getSourceLink(paragraph: Paragraph): Link | null {
  if (paragraph.children.length !== 1) return null
  const child = paragraph.children[0]
  return child.type === 'link' ? child : null
}

// Lightweight preorder walk over blockquote nodes. We avoid unist-util-visit
// because it is ESM-only and next/jest cannot transform it for unit tests.
function visitBlockquotes(node: Root | RootContent, fn: (node: Blockquote) => void): void {
  if (node.type === 'blockquote') fn(node)
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      visitBlockquotes(child as RootContent, fn)
    }
  }
}
