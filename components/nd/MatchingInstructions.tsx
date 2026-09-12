'use client'

import { useState } from 'react'
import SummaryMarkdown from './SummaryMarkdown'
import type { MatchingInstructions as MatchingInstructionsData } from '@/lib/matching/instructions-content'

export default function MatchingInstructions({ instructions }: { instructions: MatchingInstructionsData }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <h2>{instructions.title}</h2>
      <div className="nd-mb-intro-disclosure">
        <div className="nd-mb-intro-summary">
          <span>{instructions.lead}</span>
          <button
            type="button"
            className="p-link muted"
            aria-expanded={expanded}
            aria-controls="matching-book-instructions"
            onClick={() => setExpanded(value => !value)}
          >
            {expanded ? instructions.collapseLabel : instructions.expandLabel}
          </button>
        </div>
        {expanded && (
          <div id="matching-book-instructions" className="nd-mb-intro-details" aria-label="Как выбрать книгу">
            <SummaryMarkdown markdown={instructions.bodyMarkdown} />
          </div>
        )}
      </div>
    </>
  )
}
