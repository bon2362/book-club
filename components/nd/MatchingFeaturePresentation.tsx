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
  { id: 'evgeny', name: 'Евгений' },
  { id: 'vanya', name: 'Ваня' },
  { id: 'sasha', name: 'Саша' },
  { id: 'maria', name: 'Мария' },
  { id: 'lena', name: 'Лена' },
  { id: 'ilya', name: 'Илья' },
]

const books: Book[] = [
  { id: 'patriot', title: 'Патриот', author: 'Алексей Навальный', mark: 'ПАТ' },
  { id: 'kost', title: 'Моя любимая страна', author: 'Елена Костюченко', mark: 'КОС' },
  { id: 'neolib', title: 'Краткая история неолиберализма', author: 'Дэвид Харви', mark: 'НЕО' },
]

const preferences = [
  { participantId: 'evgeny', choices: ['Краткая история неолиберализма', 'Патриот'] },
  { participantId: 'vanya', choices: ['Краткая история неолиберализма', 'Моя любимая страна'] },
  { participantId: 'sasha', choices: ['Краткая история неолиберализма', 'Патриот'] },
  { participantId: 'maria', choices: ['Моя любимая страна'] },
  { participantId: 'lena', choices: ['Моя любимая страна', 'Патриот'] },
  { participantId: 'ilya', choices: ['Патриот', 'Моя любимая страна'] },
]

const bookById = new Map(books.map((book) => [book.id, book]))
const participantById = new Map(participants.map((participant) => [participant.id, participant]))

const coverageScenario: Scenario = {
  id: 'coverage',
  title: 'Сценарий А',
  label: 'максимальное покрытие',
  coverage: '6/6',
  score: 'все попали в группы',
  circles: [
    {
      bookId: 'patriot',
      members: [
        { participantId: 'evgeny', rank: 2 },
        { participantId: 'sasha', rank: 2 },
        { participantId: 'ilya', rank: 1 },
      ],
    },
    {
      bookId: 'kost',
      members: [
        { participantId: 'vanya', rank: 2 },
        { participantId: 'maria', rank: 1 },
        { participantId: 'lena', rank: 1 },
      ],
    },
  ],
  leftOut: [],
  explanation: 'Этот сценарий выше, потому что покрывает всех шестерых участников.',
}

const preferenceScenario: Scenario = {
  id: 'preference',
  title: 'Сценарий Б',
  label: 'сильнее по желаниям',
  coverage: '3/6',
  score: 'три первых выбора, но ниже покрытие',
  circles: [
    {
      bookId: 'neolib',
      members: [
        { participantId: 'evgeny', rank: 1 },
        { participantId: 'vanya', rank: 1 },
        { participantId: 'sasha', rank: 1 },
      ],
      note: 'Все трое поставили эту книгу на первое место.',
    },
  ],
  leftOut: ['maria', 'lena', 'ilya'],
  explanation: 'Этот сценарий лучше отражает интерес Евгения, Вани и Саши, но оставляет половину участников без группы.',
}

const equalCoverageScenario: Scenario = {
  id: 'equal-coverage',
  title: 'Сценарий В',
  label: 'равное покрытие, сильнее интерес',
  coverage: '6/6',
  score: 'то же покрытие, больше первых выборов',
  circles: [
    {
      bookId: 'neolib',
      members: [
        { participantId: 'evgeny', rank: 1 },
        { participantId: 'vanya', rank: 1 },
        { participantId: 'sasha', rank: 1 },
      ],
    },
    {
      bookId: 'kost',
      members: [
        { participantId: 'maria', rank: 1 },
        { participantId: 'lena', rank: 1 },
        { participantId: 'ilya', rank: 2 },
      ],
    },
  ],
  leftOut: [],
  explanation: 'При равном покрытии такой сценарий поднимается выше, потому что сильнее удовлетворяет ранги участников.',
}

const scenarios = [coverageScenario, preferenceScenario, equalCoverageScenario]

function interestLabel(rank: number) {
  if (rank === 1) return '1-й выбор'
  if (rank === 2) return '2-й выбор'
  return `${rank}-й выбор`
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
  const strong = member.rank === 1

  return (
    <span
      className={`${styles.chip} ${strong ? styles.strongChip : ''}`}
      title={`${participant?.name}: ${interestLabel(member.rank)}`}
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

function ScenarioCard({ scenario, active = false }: { scenario: Scenario; active?: boolean }) {
  return (
    <article className={`${styles.scenarioCard} ${active ? styles.activeScenario : ''}`} title={scenario.explanation}>
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
          <span>Вне групп:</span>
          {scenario.leftOut.map((id) => (
            <b key={id}>{participantById.get(id)?.name}</b>
          ))}
        </div>
      )}
    </article>
  )
}

function PreferenceTable() {
  return (
    <div className={styles.preferenceTable}>
      {preferences.map((row) => (
        <div key={row.participantId} className={styles.preferenceRow}>
          <b>{participantById.get(row.participantId)?.name}</b>
          <span>{row.choices.join(' / ')}</span>
        </div>
      ))}
    </div>
  )
}

function RankingFormula() {
  return (
    <ol className={styles.rankingList}>
      <li>
        <b>Покрытие</b>
        <span>сколько участников попадает в группы</span>
      </li>
      <li>
        <b>Сильный интерес</b>
        <span>сколько людей получают книгу из верхних позиций</span>
      </li>
      <li>
        <b>Средний ранг</b>
        <span>чем ниже средний номер книги в списках, тем лучше</span>
      </li>
      <li>
        <b>Худший ранг</b>
        <span>сценарий хуже, если кому-то досталась слишком низкая позиция</span>
      </li>
      <li>
        <b>Без ранга</b>
        <span>меньше неранжированных записей лучше</span>
      </li>
    </ol>
  )
}

function InterfaceDemo() {
  const [mode, setMode] = useState<'leader' | 'alternative' | 'move'>('leader')
  const activeScenario = useMemo(() => {
    if (mode === 'alternative') return preferenceScenario
    if (mode === 'move') return equalCoverageScenario
    return coverageScenario
  }, [mode])

  return (
    <div className={styles.prototype} data-testid="matching-presentation-prototype">
      <div className={styles.prototypeHeader}>
        <div>
          <span>Демонстрация интерфейса</span>
          <b>
            {mode === 'leader' && 'Мария видит лучший сейчас сценарий: все попали в группы.'}
            {mode === 'alternative' && 'Но рядом есть альтернатива: Евгений, Ваня и Саша хотят другую книгу сильнее.'}
            {mode === 'move' && 'Если расклад изменится, равное покрытие может сочетаться с более сильными предпочтениями.'}
          </b>
        </div>
        <div className={styles.modeButtons}>
          <button type="button" onClick={() => setMode('leader')} aria-pressed={mode === 'leader'}>
            Текущий лидер
          </button>
          <button type="button" onClick={() => setMode('alternative')} aria-pressed={mode === 'alternative'}>
            Скрытая альтернатива
          </button>
          <button type="button" onClick={() => setMode('move')} aria-pressed={mode === 'move'}>
            После хода
          </button>
        </div>
      </div>

      <div className={styles.prototypeGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h3>Читательские круги</h3>
            <p>Сценарии ранжируются, но не прячутся от обсуждения.</p>
          </div>
          <div className={styles.scenarioList}>
            {scenarios.map((scenario) => (
              <ScenarioCard key={scenario.id} scenario={scenario} active={scenario.id === activeScenario.id} />
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h3>Мои ходы</h3>
            <p>Показываем действия, которые меняют покрытие или силу предпочтений.</p>
          </div>
          <article className={styles.moveCard}>
            <BookCover book={bookById.get('neolib')!} />
            <div>
              <h4>Краткая история неолиберализма</h4>
              <p>Евгений, Ваня и Саша поставили эту книгу на первое место.</p>
              <div className={styles.moveImpact}>
                <b>Что станет видимым</b>
                <span>
                  Это не просто еще одна книга. Это сценарий, где часть участников получает более
                  сильное совпадение интересов.
                </span>
              </div>
              <button type="button" onClick={() => setMode('alternative')}>
                Показать альтернативу
              </button>
            </div>
          </article>
          <article className={`${styles.moveCard} ${styles.successMove}`}>
            <BookCover book={bookById.get('kost')!} />
            <div>
              <h4>Моя любимая страна</h4>
              <p>Если сохранится группа Марии, покрытие не обязательно конфликтует с интересом.</p>
              <div className={styles.moveImpact}>
                <b>После хода</b>
                <span>
                  При равном покрытии сценарий с большим числом первых выборов поднимается выше.
                </span>
              </div>
              <button type="button" onClick={() => setMode('move')}>
                Показать после хода
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
          <p className={styles.eyebrow}>Долгое наступление · разбор для организаторов</p>
          <h1>Как выбирать группы, если разные хорошие результаты конфликтуют</h1>
          <p>
            Это презентация не про готовый экран, а про постановку проблемы: кто выбирает критерий,
            что значит хороший расклад и как сделать последствия выбора видимыми.
          </p>
        </div>
        <div className={styles.heroBoard} aria-label="Сравнение сценариев">
          <ScenarioCard scenario={coverageScenario} active />
        </div>
      </section>

      <Slide eyebrow="Шаг 1" title="Один набор предпочтений дает несколько разумных сценариев">
        <div className={styles.twoColumn}>
          <div>
            <p>
              Участники выбирают книги, и совпадения появляются сразу в нескольких местах. Уже
              здесь задача перестает быть технической: разные варианты можно считать хорошими по
              разным причинам.
            </p>
          </div>
          <PreferenceTable />
        </div>
      </Slide>

      <Slide eyebrow="Шаг 2" title="Первый очевидный критерий: максимум людей в группах">
        <div className={styles.twoColumn}>
          <div>
            <p>
              Можно собрать «Патриот» и книгу Костюченко. Все шесть участников окажутся внутри
              групп, и для организатора это выглядит как аккуратный, защищаемый результат.
            </p>
          </div>
          <ScenarioCard scenario={coverageScenario} active />
        </div>
      </Slide>

      <Slide eyebrow="Шаг 3" title="Но покрытие не всегда равно удовлетворенности">
        <div className={styles.twoColumn}>
          <div>
            <p>
              Евгений, Ваня и Саша сильнее хотят читать «Краткую историю неолиберализма». Такой
              сценарий хуже по покрытию, но лучше отражает их реальные приоритеты.
            </p>
          </div>
          <ScenarioCard scenario={preferenceScenario} active />
        </div>
      </Slide>

      <Slide eyebrow="Шаг 4" title="Это конфликт критериев, а не ошибка алгоритма">
        <div className={styles.statementGrid}>
          <div>
            <b>Покрытие</b>
            <p>Больше людей участвуют прямо сейчас, меньше людей остаются вне групп.</p>
          </div>
          <div>
            <b>Предпочтения</b>
            <p>Люди читают книги, которые хотели сильнее, и компромисс становится честнее.</p>
          </div>
          <div>
            <b>Размер группы</b>
            <p>Группа из двух, пяти или десяти человек может быть приемлемой в разных ситуациях.</p>
          </div>
        </div>
      </Slide>

      <Slide eyebrow="Шаг 5" title="Сейчас этот конфликт фактически разрешает организатор">
        <div className={styles.assumptionList}>
          <p>Организатор решает, какой размер группы считать рабочим.</p>
          <p>Организатор выбирает, важнее ли собрать больше групп или сохранить сильный интерес.</p>
          <p>Организатор фактически говорит участникам, какие книги стоит добавить ради общего расклада.</p>
          <p>Проблема не в ошибке организатора, а в том, что критерий остается неявным.</p>
        </div>
      </Slide>

      <Slide eyebrow="Шаг 6" title="Мария видит свою группу, но не видит потерянную альтернативу">
        <div className={styles.twoColumn}>
          <div>
            <p>
              Для Марии все выглядит нормально: книга Костюченко собирается, она внутри группы.
              Но ей не видно, что рядом существует более желанный сценарий для Евгения, Вани и
              Саши.
            </p>
          </div>
          <div className={styles.mariaView}>
            <div>
              <span>Мария видит</span>
              <b>«Моя любимая страна» собирается</b>
              <p>Я внутри группы. Значит, расклад работает.</p>
            </div>
            <div>
              <span>Мария не видит</span>
              <b>Евгений + Ваня + Саша хотят «Неолиберализм»</b>
              <p>Ее выбор влияет на то, какие альтернативы становятся возможны.</p>
            </div>
          </div>
        </div>
      </Slide>

      <Slide eyebrow="Принцип 1" title="Нужен не алгоритм-судья, а карта вариантов" tone="dark">
        <div className={styles.finalGrid}>
          <div>
            <b>Не так</b>
            <p>Система молча выбирает один лучший сценарий и превращает критерий в скрытое правило.</p>
          </div>
          <div>
            <b>Так</b>
            <p>Система показывает возможные сценарии, компромиссы, ранжирование и последствия выбора.</p>
          </div>
        </div>
      </Slide>

      <Slide eyebrow="Интерфейс" title="Участник видит не только итог, но и пространство сценариев">
        <InterfaceDemo />
      </Slide>

      <Slide eyebrow="Механика" title="Как ранжируются сценарии">
        <div className={styles.twoColumn}>
          <p>
            Ранжирование должно быть объяснимым. Сейчас логика такая: сначала больше покрытие, потом
            больше сильных интересов, затем качество рангов. Это не доказывает, что критерий
            правильный, но делает его обсуждаемым.
          </p>
          <RankingFormula />
        </div>
      </Slide>

      <Slide eyebrow="Ограничение" title="Даже прозрачное ранжирование не закрывает дискуссию">
        <div className={styles.questionBlock}>
          <b>Что лучше?</b>
          <p>
            Шесть человек читают компромиссные книги, или три человека читают книгу, которую они
            действительно поставили на первое место?
          </p>
        </div>
      </Slide>

      <Slide eyebrow="Принцип 2" title="Показывать не только сценарии, но и рычаги">
        <div className={styles.solutionGrid}>
          <div>
            <b>Если добавить книгу</b>
            <p>Может появиться новая группа или равное покрытие с более сильными предпочтениями.</p>
          </div>
          <div>
            <b>Если выбрать сценарий</b>
            <p>Другие участники увидят, что этот расклад становится реальным кандидатом.</p>
          </div>
          <div>
            <b>Если оставить как есть</b>
            <p>Сохраняется текущий лидер, вместе с его компромиссами и потерянными альтернативами.</p>
          </div>
        </div>
      </Slide>

      <Slide eyebrow="Для организатора" title="Меняется не только интерфейс, но и роль организатора">
        <div className={styles.statementGrid}>
          <div>
            <b>Было</b>
            <p>Организатор держит расклад в голове и вручную выбирает лучший компромисс.</p>
          </div>
          <div>
            <b>Становится</b>
            <p>Сценарии, критерии и последствия видны, поэтому обсуждение становится предметным.</p>
          </div>
          <div>
            <b>Остается</b>
            <p>Организатор задает правила, модерирует конфликт и помогает принять коллективное решение.</p>
          </div>
        </div>
      </Slide>

      <Slide eyebrow="Вопросы" title="Что важно покритиковать">
        <div className={styles.assumptionList}>
          <p>Должно ли покрытие быть первым критерием?</p>
          <p>Как считать силу предпочтений: по первым выборам, среднему рангу или худшему рангу?</p>
          <p>Нормальна ли группа из двух человек? А из пяти или десяти?</p>
          <p>Нужно ли показывать все сценарии или только релевантные конкретному участнику?</p>
          <p>Где граница между показать последствия и начать давить на участника?</p>
          <p>Достаточно ли анонимизации, если сценарии все равно делают конфликт видимым?</p>
        </div>
      </Slide>

      <Slide eyebrow="Итог" title="Цель не автоматизировать волю клуба">
        <div className={styles.questionBlock}>
          <b>Цель</b>
          <p>
            Сделать видимыми варианты, компромиссы и последствия выбора, чтобы организаторы и
            участники могли принять решение осознанно.
          </p>
        </div>
      </Slide>
    </main>
  )
}
