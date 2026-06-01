'use client'

import { useMemo, useState } from 'react'
import styles from './MatchingFeaturePresentation.module.css'

type Participant = {
  id: string
  name: string
}

type Book = {
  id: string
  title: string
  author: string
  mark: string
}

type Member = {
  participantId: string
  rank: number
}

type Circle = {
  bookId: string
  members: Member[]
  note?: string
}

type Scenario = {
  id: string
  title: string
  label: string
  coverage: string
  score: string
  circles: Circle[]
  leftOut: string[]
  explanation: string
}

const participants: Participant[] = [
  { id: 'maria', name: 'Мария' },
  { id: 'vanya', name: 'Ваня' },
  { id: 'evgeny', name: 'Евгений' },
  { id: 'artem', name: 'Артем' },
  { id: 'julia', name: 'Юлия' },
  { id: 'alex', name: 'Александр' },
]

const books: Book[] = [
  { id: 'country', title: 'Моя любимая страна', author: 'Елена Костюченко', mark: 'МОЯ' },
  { id: 'patriot', title: 'Патриот', author: 'Алексей Навальный', mark: 'ПАТ' },
  { id: 'neolib', title: 'Краткая история неолиберализма', author: 'David Harvey', mark: 'НЕО' },
  { id: 'consensus', title: 'Консенсус: принятие решений в свободном обществе', author: 'Peter Gelderloos', mark: 'КОН' },
]

const bookById = new Map(books.map((book) => [book.id, book]))
const participantById = new Map(participants.map((participant) => [participant.id, participant]))

const beforeScenarios: Scenario[] = [
  {
    id: 'before-best',
    title: 'Сценарий 1',
    label: 'лучший сейчас',
    coverage: '6/6',
    score: 'полное покрытие, но не максимум интереса',
    circles: [
      {
        bookId: 'country',
        members: [
          { participantId: 'maria', rank: 1 },
          { participantId: 'vanya', rank: 2 },
          { participantId: 'evgeny', rank: 4 },
        ],
      },
      {
        bookId: 'patriot',
        members: [
          { participantId: 'artem', rank: 3 },
          { participantId: 'julia', rank: 2 },
          { participantId: 'alex', rank: 5 },
        ],
      },
    ],
    leftOut: [],
    explanation: 'Алгоритм сначала выбирает сценарии, где занято больше людей. Здесь заняты все, поэтому этот сценарий наверху.',
  },
  {
    id: 'before-desired',
    title: 'Сценарий 2',
    label: 'сильнее по желаниям',
    coverage: '3/6',
    score: 'лучшие ранги, но половина людей вне круга',
    circles: [
      {
        bookId: 'neolib',
        members: [
          { participantId: 'artem', rank: 1 },
          { participantId: 'alex', rank: 1 },
          { participantId: 'evgeny', rank: 1 },
        ],
        note: 'Эти трое сильнее хотят именно эту книгу.',
      },
    ],
    leftOut: ['maria', 'julia', 'vanya'],
    explanation: 'Этот круг очень желанный, но если выбрать только его, Мария, Юлия и Ваня не попадают ни в один круг.',
  },
]

const afterScenarios: Scenario[] = [
  {
    id: 'after-best',
    title: 'Сценарий 1',
    label: 'лучший после хода',
    coverage: '6/6',
    score: 'полное покрытие и выше суммарный интерес',
    circles: [
      {
        bookId: 'consensus',
        members: [
          { participantId: 'maria', rank: 1 },
          { participantId: 'julia', rank: 2 },
          { participantId: 'vanya', rank: 2 },
        ],
        note: 'Ход Марии собирает второй круг.',
      },
      {
        bookId: 'neolib',
        members: [
          { participantId: 'artem', rank: 1 },
          { participantId: 'alex', rank: 1 },
          { participantId: 'evgeny', rank: 1 },
        ],
      },
    ],
    leftOut: [],
    explanation: 'Теперь покрытие остается полным, но люди чаще получают книги с высоким личным приоритетом.',
  },
]

const moveParticipants: Member[] = [
  { participantId: 'julia', rank: 2 },
  { participantId: 'vanya', rank: 2 },
]

function interestLabel(rank: number) {
  return rank <= 1 ? 'очень хочет' : 'хочет'
}

function Slide({
  eyebrow,
  title,
  children,
  tone = 'light',
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
  tone?: 'light' | 'dark'
}) {
  return (
    <section className={`${styles.slide} ${tone === 'dark' ? styles.darkSlide : ''}`}>
      <div className={styles.slideInner}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  )
}

function BookCover({ book }: { book: Book }) {
  return (
    <div className={styles.cover} aria-hidden="true">
      <span>{book.mark}</span>
    </div>
  )
}

function Chip({ member }: { member: Member }) {
  const participant = participantById.get(member.participantId)
  const strong = member.rank <= 1

  return (
    <span
      className={`${styles.chip} ${strong ? styles.strongChip : ''}`}
      title={`${participant?.name}: книга на ${member.rank} месте`}
    >
      <b>{participant?.name}</b>
      <span>{interestLabel(member.rank)}</span>
    </span>
  )
}

function CircleCard({ circle }: { circle: Circle }) {
  const book = bookById.get(circle.bookId)
  if (!book) return null

  return (
    <article className={styles.circleCard}>
      <BookCover book={book} />
      <div>
        <h4>{book.title}</h4>
        <p>{book.author}</p>
        <div className={styles.chipRow}>
          {circle.members.map((member) => (
            <Chip key={`${circle.bookId}-${member.participantId}`} member={member} />
          ))}
        </div>
        {circle.note && <div className={styles.circleNote}>{circle.note}</div>}
      </div>
    </article>
  )
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  return (
    <article className={styles.scenarioCard} title={scenario.explanation}>
      <div className={styles.scenarioHeader}>
        <div>
          <h3>{scenario.title}</h3>
          <span>{scenario.label}</span>
        </div>
        <div className={styles.coverage}>
          <b>{scenario.coverage}</b>
          <span>участников</span>
        </div>
      </div>
      <div className={styles.scenarioScore}>{scenario.score}</div>
      <div className={styles.circleStack}>
        {scenario.circles.map((circle) => (
          <CircleCard key={`${scenario.id}-${circle.bookId}`} circle={circle} />
        ))}
      </div>
      {scenario.leftOut.length > 0 && (
        <div className={styles.leftOut}>
          <span>За бортом:</span>
          {scenario.leftOut.map((id) => (
            <b key={id}>{participantById.get(id)?.name}</b>
          ))}
        </div>
      )}
    </article>
  )
}

function MiniPrototype() {
  const [afterMove, setAfterMove] = useState(false)
  const scenarios = afterMove ? afterScenarios : beforeScenarios
  const heroText = useMemo(
    () =>
      afterMove
        ? 'Мария добавила «Консенсус» на первое место. Лучшим стал другой сценарий.'
        : 'Сейчас все заняты, но часть людей читает не самую желанную книгу.',
    [afterMove]
  )

  return (
    <div className={styles.prototype} data-testid="matching-presentation-prototype">
      <div className={styles.prototypeHeader}>
        <div>
          <span>Сессия: пример на 6 участниках</span>
          <b>{heroText}</b>
        </div>
        <button type="button" onClick={() => setAfterMove((value) => !value)}>
          {afterMove ? 'Вернуть исходный расклад' : 'Мария добавляет «Консенсус»'}
        </button>
      </div>

      <div className={styles.prototypeGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h3>Читательские круги</h3>
            <p>Показываем топ сценариев, а не все возможные комбинации.</p>
          </div>
          <div className={styles.scenarioList}>
            {scenarios.map((scenario) => (
              <ScenarioCard key={scenario.id} scenario={scenario} />
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h3>Мои ходы</h3>
            <p>Только действия, которые меняют лучший сценарий.</p>
          </div>
          <article className={`${styles.moveCard} ${afterMove ? styles.moveDone : ''}`}>
            <BookCover book={bookById.get('consensus')!} />
            <div>
              <h4>Консенсус: принятие решений в свободном обществе</h4>
              <p>Уже записались:</p>
              <div className={styles.chipRow}>
                {moveParticipants.map((member) => (
                  <Chip key={member.participantId} member={member} />
                ))}
              </div>
              <div className={styles.moveImpact}>
                <b>После добавления</b>
                <span>
                  Лучшим сценарием станет: Консенсус + Краткая история неолиберализма.
                </span>
              </div>
              <button type="button" onClick={() => setAfterMove(true)} disabled={afterMove}>
                {afterMove ? 'Добавлено на первое место' : 'Хочу читать * на первое место'}
              </button>
            </div>
          </article>
        </section>
      </div>
    </div>
  )
}

export default function MatchingFeaturePresentation() {
  return (
    <main className={styles.deck}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Долгое наступление · matching</p>
          <h1>Как показать влияние одного выбора на общий расклад чтения</h1>
          <p>
            Презентация фичи через пример Марии: почему один новый интерес может не просто
            собрать круг, а улучшить распределение для всей сессии.
          </p>
        </div>
        <div className={styles.heroBoard} aria-label="Схема читательских кругов">
          <ScenarioCard scenario={beforeScenarios[0]} />
        </div>
      </section>

      <Slide eyebrow="Проблема 1" title="Группы могут собраться вокруг не самых желанных книг">
        <div className={styles.twoColumn}>
          <p>
            Формально все хорошо: шесть человек разбиты на две группы. Но Артем, Александр и
            Евгений сильнее хотят читать «Краткую историю неолиберализма».
          </p>
          <ScenarioCard scenario={beforeScenarios[0]} />
        </div>
      </Slide>

      <Slide eyebrow="Проблема 2" title="Без прозрачности участники верят администратору на слово">
        <div className={styles.statementGrid}>
          <div>
            <b>Сейчас</b>
            <p>«Кто-то посчитал, что так лучше».</p>
          </div>
          <div>
            <b>Нужно</b>
            <p>Псевдонимы, ранги и объяснение, почему сценарий оказался выше других.</p>
          </div>
          <div>
            <b>Важно</b>
            <p>Анонимность сохраняется: видны не реальные имена, а устойчивые псевдонимы.</p>
          </div>
        </div>
      </Slide>

      <Slide eyebrow="Проблема 3" title="Если все уже заняты, непонятно, зачем что-то менять">
        <div className={styles.twoColumn}>
          <p>
            У Марии уже есть рабочий сценарий: она читает «Мою любимую страну», остальные тоже
            распределены. Но она не видит, что ее ход может открыть более желанный расклад для
            Артема, Александра и Евгения.
          </p>
          <ScenarioCard scenario={beforeScenarios[1]} />
        </div>
      </Slide>

      <Slide eyebrow="Предпосылки" title="Лучший сценарий не всегда значит «всем идеально»">
        <div className={styles.assumptionList}>
          <p>Сначала максимизируем покрытие: меньше людей за бортом.</p>
          <p>Если человек не выбрал книги, которые выбирают остальные, он может остаться вне круга.</p>
          <p>Но если показать людям последствия их выбора, они могут добровольно сдвинуть расклад.</p>
        </div>
      </Slide>

      <Slide eyebrow="Решение" title="Показываем не все варианты, а только полезную картину">
        <div className={styles.solutionGrid}>
          <div>
            <b>1</b>
            <p>Считаем топ сценариев и показываем, кто попадает в круги, а кто остается за бортом.</p>
          </div>
          <div>
            <b>2</b>
            <p>Показываем голоса через псевдонимы и ранги, чтобы не раскрывать реальные имена.</p>
          </div>
          <div>
            <b>3</b>
            <p>Лучший сценарий сортируется по покрытию, затем по силе интереса и качеству рангов.</p>
          </div>
          <div>
            <b>4</b>
            <p>В «Моих ходах» остаются только действия, которые меняют лучший сценарий.</p>
          </div>
        </div>
      </Slide>

      <Slide eyebrow="Интерактивный прототип" title="Мария видит, что ее ход меняет лучший сценарий">
        <MiniPrototype />
      </Slide>

      <Slide eyebrow="Ключевой сигнал" title="Нужно объяснить не математику, а последствие" tone="dark">
        <div className={styles.finalGrid}>
          <div>
            <b>Главный консерн</b>
            <p>
              Поймет ли пользователь, что другие хотят другую книгу, но без его действия этот круг
              оставит часть людей за бортом?
            </p>
          </div>
          <div>
            <b>Решение в интерфейсе</b>
            <p>
              «Мои ходы» показывают только сильные действия: если поставить книгу на первое место,
              лучший сценарий изменится. В карточке сразу видно, каким он станет.
            </p>
          </div>
        </div>
      </Slide>
    </main>
  )
}
