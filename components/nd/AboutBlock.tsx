'use client'

import { useState, useRef, useImperativeHandle, forwardRef } from 'react'

export interface AboutBlockHandle {
  openAccordion: () => void
  scrollIntoView: () => void
}

interface AccordionSectionProps {
  number: number
  question: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

function AccordionSection({ number, question, isOpen, onToggle, children }: AccordionSectionProps) {
  const answerId = `about-section-answer-${number}`
  const buttonId = `about-section-btn-${number}`

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
          {children}
        </div>
      </div>
    </div>
  )
}

const SECTIONS: { question: string; content: React.ReactNode }[] = [
  {
    question: 'Что это такое?',
    content: (
      <>
        <p style={{ marginBottom: '0.4rem' }}>
          Сервис для формирования читательских кругов. Вместе читаем книги по демократии и встречаемся раз в неделю, чтобы поделиться впечатлениями.
        </p>
        <p style={{ marginBottom: 0 }}>
          Когда набирается 3–4 человека, желающих прочитать одну книгу, — я собираю вас в Telegram-группу.
        </p>
      </>
    ),
  },
  {
    question: 'Как это устроено?',
    content: (
      <>
        <p style={{ marginBottom: '0.4rem' }}>
          Отмечаете книги, которые хотите прочитать. На пересечении интересов я определяю группу из 3–4 человек и создаю общий чат.
        </p>
        <p style={{ marginBottom: 0 }}>
          Группа выбирает ведущего, встречаетесь раз в неделю на ~30 минут по видеосвязи.
        </p>
      </>
    ),
  },
  {
    question: 'Для кого это?',
    content: (
      <p style={{ marginBottom: 0 }}>
        Для тех, кому совместное чтение помогает в изучении демократии. Важное условие: готовность созваниваться с включёнными камерами.
      </p>
    ),
  },
  {
    question: 'Почему именно демократия?',
    content: (
      <p style={{ marginBottom: 0 }}>
        Мы не можем дать определение демократии — поэтому и читаем. Нам интересен сам процесс выяснения, что она означает в теории и на практике.
      </p>
    ),
  },
  {
    question: 'Чем это не является?',
    content: (
      <p style={{ marginBottom: 0 }}>
        Это не дискуссионный клуб — мы встречаемся не для дебатов. Мы осознаём, что данный формат — информационный пузырь. Для другого есть другие форматы.
      </p>
    ),
  },
]

interface AboutBlockProps {
  onClose: () => void
}

const AboutBlock = forwardRef<AboutBlockHandle, AboutBlockProps>(function AboutBlock(
  { onClose },
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
    if (!isAccordionOpen) {
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
            Читательские круги
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
            <p
              style={{
                flex: 1,
                fontSize: '0.875rem',
                lineHeight: 1.65,
                color: '#555',
                margin: 0,
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              }}
            >
              Собираю небольшие читательские группы — по{' '}
              <strong style={{ color: '#333' }}>3–4 человека</strong>, раз в неделю по
              видеосвязи, о книгах по демократии. Выбирайте, что хотите прочитать — я найду
              вам компанию.
            </p>
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
            <div style={{ marginTop: '0.75rem' }}>
              {SECTIONS.map((section, idx) => (
                <AccordionSection
                  key={idx}
                  number={idx + 1}
                  question={section.question}
                  isOpen={openSection === idx}
                  onToggle={() => handleSectionToggle(idx)}
                >
                  {section.content}
                </AccordionSection>
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
