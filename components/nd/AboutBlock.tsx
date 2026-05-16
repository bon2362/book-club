'use client'

import { useState, useRef, useImperativeHandle, forwardRef } from 'react'
import { bodyToParagraphs } from '@/lib/intro-format'

export interface AboutBlockHandle {
  openAccordion: () => void
  scrollIntoView: () => void
}

export interface AboutBlockHeader {
  title: string
  body: string
}

export interface AboutBlockSection {
  id: string
  title: string
  body: string
}

interface AccordionSectionProps {
  number: number
  question: string
  body: string
  isOpen: boolean
  onToggle: () => void
}

function AccordionSection({ number, question, body, isOpen, onToggle }: AccordionSectionProps) {
  const answerId = `about-section-answer-${number}`
  const buttonId = `about-section-btn-${number}`
  const paragraphs = bodyToParagraphs(body)

  return (
    <div
      style={{
        display: 'flex',
        gap: '1.5rem',
        padding: '0.75rem 0',
        borderTop: '1px solid #f0f0f0',
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          color: '#ccc',
          fontFamily: 'var(--nd-serif), Georgia, serif',
          paddingTop: '0.05rem',
          flexShrink: 0,
          width: '1rem',
          textAlign: 'right',
        }}
      >
        {number}
      </div>
      <div style={{ flex: 1 }}>
        <button
          id={buttonId}
          aria-expanded={isOpen}
          aria-controls={answerId}
          onClick={onToggle}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            padding: 0,
            fontFamily: 'var(--nd-serif), Georgia, serif',
            fontSize: '0.95rem',
            color: isOpen ? '#111' : '#444',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            lineHeight: 1.3,
            minHeight: '44px',
            transition: 'color 0.15s',
          }}
        >
          {question}
          <span
            style={{
              fontSize: '0.65rem',
              color: '#ccc',
              marginLeft: '0.5rem',
              flexShrink: 0,
              display: 'inline-block',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
            }}
          >
            ▼
          </span>
        </button>
        <div
          id={answerId}
          role="region"
          aria-labelledby={buttonId}
          style={{
            display: isOpen ? 'block' : 'none',
            paddingTop: '0.5rem',
            fontSize: '0.83rem',
            lineHeight: 1.7,
            color: '#555',
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          }}
        >
          {paragraphs.map((p, idx) => (
            <p key={idx} style={{ marginBottom: idx === paragraphs.length - 1 ? 0 : '0.4rem' }}>
              {p}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

interface AboutBlockProps {
  onClose: () => void
  header: AboutBlockHeader
  sections: AboutBlockSection[]
}

const AboutBlock = forwardRef<AboutBlockHandle, AboutBlockProps>(function AboutBlock(
  { onClose, header, sections },
  ref
) {
  const [isAccordionOpen, setIsAccordionOpen] = useState(false)
  const [openSection, setOpenSection] = useState<number | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const domRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    openAccordion() {
      setIsAccordionOpen(true)
      setOpenSection(null)
    },
    scrollIntoView() {
      domRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    },
  }))

  function handleBlockClick() {
    if (isAccordionOpen) {
      setIsAccordionOpen(false)
      setOpenSection(null)
    } else {
      setIsAccordionOpen(true)
    }
  }

  function handleMoreClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    setIsAccordionOpen(v => {
      if (v) setOpenSection(null)
      return !v
    })
  }

  function handleCloseClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    onClose()
  }

  function handleSectionToggle(idx: number) {
    setOpenSection(prev => (prev === idx ? null : idx))
  }

  const borderColor = isAccordionOpen ? '#888' : isHovered ? '#999' : '#ccc'
  const bgColor = isAccordionOpen || isHovered ? '#fafafa' : '#fff'
  const leadParagraphs = bodyToParagraphs(header.body)

  return (
    <>
      <div
        ref={domRef}
        role="region"
        aria-label="Читательские круги"
        onClick={handleBlockClick}
        onKeyDown={(e) => { if (!isAccordionOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setIsAccordionOpen(true) } }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={() => setIsHovered(false)}
        tabIndex={isAccordionOpen ? -1 : 0}
        style={{
          borderBottom: '1px solid #E5E5E5',
          borderLeft: `3px solid ${borderColor}`,
          background: bgColor,
          cursor: isAccordionOpen ? 'default' : 'pointer',
          transition: 'background 0.15s, border-left-color 0.15s',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '1.1rem 1.5rem',
          }}
        >
          {/* Eyebrow */}
          <div
            style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#bbb',
              marginBottom: '0.4rem',
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            }}
          >
            {header.title}
          </div>

          {/* L1 row */}
          <div
            className="about-l1-row"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '1rem',
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: '0.875rem',
                lineHeight: 1.65,
                color: '#555',
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              }}
            >
              {leadParagraphs.map((p, idx) => (
                <p key={idx} style={{ margin: idx === 0 ? 0 : '0.4rem 0 0 0' }}>{p}</p>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexShrink: 0,
              }}
            >
              <button
                onClick={handleMoreClick}
                style={{
                  fontSize: '0.75rem',
                  color: '#555',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {isAccordionOpen ? 'Свернуть ↑' : 'Подробнее ↓'}
              </button>
              <button
                onClick={handleCloseClick}
                title="Скрыть"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#ccc',
                  fontSize: '1rem',
                  lineHeight: 1,
                  minWidth: '44px',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Accordion */}
          {isAccordionOpen && (
            <div style={{ marginTop: '0.75rem' }} onClick={e => e.stopPropagation()}>
              {sections.map((section, idx) => (
                <AccordionSection
                  key={section.id}
                  number={idx + 1}
                  question={section.title}
                  body={section.body}
                  isOpen={openSection === idx}
                  onToggle={() => handleSectionToggle(idx)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 480px) {
          .about-l1-row {
            flex-direction: column !important;
          }
        }
      `}</style>
    </>
  )
})

export default AboutBlock
