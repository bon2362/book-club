# Полоса матчинга на главной

**Дата:** 2026-09-10
**Статус:** дизайн согласован (Claude Design, вариант B2), план реализации не написан

## Задача

У раздела `/matching` нет ни одной ссылки на сайте. Участники получают адрес в телеграм-группе; человек, зашедший сам, не может обнаружить, что подбор идёт.

Задача добавляет на **главную**, сразу под общей шапкой и **выше блока «Читательские круги»**, одну полосу-вход: микрометка «Идёт матчинг», строка Georgia с пояснением и переход на `/matching`.

Дизайн-пакет: `design_handoff_matching_entry` (вариант B2). Файлы пакета — HTML-прототип, а не продакшн-код: элемент воспроизводится в текущем стеке по паттернам проекта.

Спека самодостаточна: всё нужное из пакета, включая точные стили, перенесено сюда, и сам пакет для реализации не требуется. **Где спека расходится с пакетом — права спека:** пример компонента `MatchingStrip` со своим `useState` и ручным `document.cookie`, а также закрытие крестиком по флагу `true` на 30 дней заменены ниже (видимостью владеет `BooksPage`, cookie хранит id сессии).

## Проверено по коду перед написанием спеки

Реализатору не нужно это перепроверять:

- Все девять токенов существуют в `app/globals.css` с теми же значениями: `--bg-tint` `#F6EAE2`, `--accent` `#C0603A`, `--accent-hover` `#A04E2E`, `--accent-line` `#E4C7B5`, `--hair` `#ECE3D4`, `--text` `#111111`, `--text-muted` `#999999`, `--nd-serif`, `--nd-sans`.
- Точка вставки — `components/nd/BooksPage.tsx:356`: `<Header … />`, затем `{aboutVisible && <AboutBlock … />}`, затем липкая панель фильтров.
- `MATCHING_OPEN_DB_STATUSES = ['active', 'open']` — `lib/matching/session-status.ts:1`.
- `track(event, properties)` — `lib/analytics.ts:37`.
- Приём «тап-таргет 44px через `display:inline-flex` + `min-height`» уже применён к `.p-link` на ≤540px — `app/globals.css:593`.
- `app/page.tsx` уже `force-dynamic`, уже читает cookie (`about_dismissed`, `book_view_mode`, `show_read`) и уже собирает данные одним `Promise.all`.

## Ключевое решение: полоса — навигация, а не сводка

В полосе нет ни дедлайна, ни числа участников, ни статуса круга, ни названия сессии. Всё это человек видит на самой странице подбора, и там оно всегда актуально.

Следствие, принятое сознательно: **внутренние состояния подбора на полосу не влияют**. Участник, который уже выбрал книги, участник в собравшемся круге и участник, чей круг отправлен читать, видят одну и ту же полосу с текстом «Выбираем книги и собираем круги на новый сезон». Для последнего это формально не про него — но полоса ведёт на его же страницу, где написано «Ваш подбор завершён». Делать текст полосы зависимым от состояния — значит превращать навигацию в сводку и заводить шесть вариантов копирайта, каждый из которых надо поддерживать.

## Условия показа

Полоса рендерится, только когда выполнено всё:

1. пользователь вошёл (есть сессия аутентификации);
2. есть открытая сессия матчинга (`status IN ('active','open')`);
3. полоса не закрыта крестиком для **этой** сессии матчинга.

Гостю полосы нет: матчинг требует входа, и вести незарегистрированного в тупик незачем. Между сессиями полосы тоже нет — поэтому ни один элемент интерфейса не ведёт в никуда.

**Постоянного входа в шапке не добавляется.** На ≤540px текстовые ссылки шапки скрыты, а кружок-значок без подписи не объясняет себя — это был главный минус отвергнутого варианта A.

## Закрытие крестиком привязано к сессии матчинга

Cookie `matching_strip_dismissed` хранит **id закрытой сессии матчинга**, а не флаг. Сервер показывает полосу, если значение cookie не совпадает с id текущей открытой сессии.

Причина отхода от пакета (там был флаг на 30 дней): полоса — единственный вход в матчинг. Флаг на 30 дней переживает типичную сессию подбора, и человек, машинально закрывший полосу в первый день, до конца сезона не увидит ни одной ссылки. Пакет уже применяет эту логику к телефону («случайное закрытие лишает единственного входа» — поэтому там крестика нет); привязка к id распространяет её на десктоп, не отнимая возможность убрать полосу с глаз в текущем сезоне. Следующий подбор приносит полосу обратно сам, без ожидания истечения cookie.

Срок жизни cookie — как у остальных пользовательских предпочтений проекта (`setPrefCookie`, год): при привязке к id он больше ничего не решает.

## Где это живёт

- `app/page.tsx` — сервер узнаёт открытую сессию и решает, показывать ли полосу.
- `components/nd/BooksPage.tsx` — рендер полосы и владение её видимостью.
- `components/nd/MatchingStrip.tsx` — новый компонент разметки.
- `app/globals.css` — правила `.nd-matching-strip*` рядом с прочими `.nd-*`.

### Сервер (`app/page.tsx`)

В существующий `Promise.all` добавляется запрос открытой сессии — паттерн уже есть в `lib/matching/middleware.ts`:

```ts
const openSessionRows = await db
  .select({ id: matchingSessions.id })
  .from(matchingSessions)
  .where(inArray(matchingSessions.status, [...MATCHING_OPEN_DB_STATUSES]))
  .limit(1)
  .catch(() => [])
```

Дальше рядом с чтением `about_dismissed`:

```ts
const dismissedSessionId = cookieStore.get('matching_strip_dismissed')?.value ?? null
const openMatchingSessionId = session?.user?.id ? openSessionRows[0]?.id ?? null : null
const matchingStripSessionId = openMatchingSessionId && openMatchingSessionId !== dismissedSessionId
  ? openMatchingSessionId
  : null
```

`matchingStripSessionId` передаётся пропсом в `BooksPage`. Запрос обязан быть устойчив к падению БД (`.catch(() => [])`), как соседние: главная не должна падать из-за матчинга.

### Клиент (`BooksPage.tsx`)

Видимостью владеет `BooksPage` — ровно так же, как уже владеет `aboutVisible`. Поэтому `MatchingStrip` остаётся компонентом без состояния, а запись cookie живёт рядом с остальными предпочтениями, в существующем хелпере `setPrefCookie` (он ставит `samesite=lax`; писать `document.cookie` вручную не нужно).

```tsx
const [matchingStripVisible, setMatchingStripVisible] = useState(matchingStripSessionId !== null)

function handleCloseMatchingStrip() {
  setMatchingStripVisible(false)
  if (matchingStripSessionId) setPrefCookie('matching_strip_dismissed', matchingStripSessionId)
}
```

Порядок в разметке — строго между шапкой и «Читательскими кругами»:

```tsx
<Header … />

{matchingStripVisible && <MatchingStrip onClose={handleCloseMatchingStrip} />}

{aboutVisible && <AboutBlock … />}
```

Полоса **не липкая**: уезжает при скролле вместе с содержимым. Липкими остаются шапка и панель фильтров, как сейчас.

### Разметка (`MatchingStrip.tsx`)

Структура: контейнер → внутренний блок с максимальной шириной 1200px → тело (микрометка с точкой + строка Georgia), ссылка-действие, кнопка закрытия.

- Действие — настоящая ссылка `next/link` на `/matching`, с `track('matching_strip_clicked', { source: 'home' })` по клику.
- Точка-индикатор и символ «×» декоративны: `aria-hidden="true"`; у кнопки закрытия — `aria-label="Скрыть полосу матчинга"`.
- Никаких inline-цветов: оформление целиком в `globals.css`.

### Копирайт

- Микрометка: **Идёт матчинг** — заглавными, с разрядкой, как остальные микрометки сайта.
- Строка: **Выбираем книги и собираем круги на новый сезон**.
- Действие: **Перейти в матчинг →**.

Слово «матчинг» выбрано сознательно: оно прижилось среди участников. Строка Georgia существует ровно для тех, кто этого слова ещё не знает.

## Стили

Правила ниже взяты из дизайн-пакета без изменений и добавляются в `app/globals.css` рядом с прочими `.nd-*`:

```css
/* ── Полоса матчинга на главной ──────────────────────────────────────── */
.nd-matching-strip{
  background: var(--bg-tint);
  border-bottom: 1px solid var(--hair);
  border-left: 3px solid var(--accent);
}
.nd-matching-strip__in{
  max-width: 1200px; margin: 0 auto;
  padding: .85rem 1.5rem;
  display: flex; align-items: center; gap: 1.5rem;
}
.nd-matching-strip__body{ flex: 1; min-width: 0; }
.nd-matching-strip__eyebrow{
  display: inline-flex; align-items: center; gap: .45rem;
  font-family: var(--nd-sans);
  font-size: .6rem; font-weight: 600;
  letter-spacing: .12em; text-transform: uppercase;
  color: var(--accent-hover);   /* 4.9:1 на --bg-tint; сам --accent даёт только 3.6:1 */
}
.nd-matching-strip__dot{
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent); flex-shrink: 0;
}
.nd-matching-strip__title{
  margin: .3rem 0 0;
  font-family: var(--nd-serif);
  font-size: 1.05rem; line-height: 1.3;
  color: var(--text);
}
.nd-matching-strip__cta{
  flex-shrink: 0;
  padding: 0 0 2px;
  border-bottom: 1px solid var(--accent-line);
  color: var(--accent-hover);   /* 4.9:1 на --bg-tint */
  font: 600 .8rem/1.4 var(--nd-sans);
  text-decoration: none;
  transition: color .15s ease, border-color .15s ease;
}
.nd-matching-strip__cta:hover{ color: var(--text); border-bottom-color: var(--text-muted); }
.nd-matching-strip__cta:focus-visible{ outline: 2px solid var(--accent); outline-offset: 3px; }
.nd-matching-strip__close{
  flex-shrink: 0;
  min-width: 44px; min-height: 44px;
  display: flex; align-items: center; justify-content: center;
  padding: 0; border: none; background: none; cursor: pointer;
  color: var(--text-muted); font-size: 1rem; line-height: 1;
}
.nd-matching-strip__close:hover{ color: var(--text-secondary); }

@media (max-width: 540px){
  .nd-matching-strip__in{
    padding: .5rem .9rem;
    flex-direction: column; align-items: flex-start; gap: 0;
  }
  .nd-matching-strip__title{ font-size: 1rem; }
  .nd-matching-strip__cta{
    align-self: flex-start;
    display: inline-flex; align-items: center;
    min-height: 44px;                 /* как .nd-mb-intro-summary .p-link */
  }
  .nd-matching-strip__close{ display: none; }
}
@media (prefers-reduced-motion: reduce){
  .nd-matching-strip__cta{ transition: none; }
}
```

`border-radius: 50%` у точки — единственное скругление. Формально правило дизайн-системы разрешает круг только аватарам участников, но круглые точки-индикаторы статуса в проекте уже есть — «онлайн» в поповере участников (`components/nd/MatchingHeader.tsx`) и в админской таблице (`components/nd/AdminMatchingSession.tsx`). Точка здесь — тот же графический индикатор, не контейнер; литерального `rounded-*` не появляется.

Существенное:

- Фон `--bg-tint`, нижняя граница `--hair`, слева акцентная линия `3px solid var(--accent)`.
- Ни одного литерального цвета, ни скруглений, ни теней — правила дизайн-системы проекта.
- **Контраст:** текст микрометки и действия — `--accent-hover` (4.9:1 на `--bg-tint`). Светлый `--accent` даёт на этом фоне лишь 3.6:1 и мелкому тексту не подходит, поэтому остаётся только на линии слева и точке — это графика, а не текст.
- `:focus-visible` у действия — контур `2px var(--accent)` с отступом 3px.
- `@media (prefers-reduced-motion: reduce)` снимает переход цвета.

### Адаптив

- **≥541px:** одна строка, тело слева, действие и крестик справа, выравнивание по центру.
- **≤540px:** колонка — микрометка, строка Georgia, действие у левого края с тап-таргетом `min-height: 44px` через `display:inline-flex`. **Крестик скрыт**, чтобы случайный тап не убрал единственный вход.
- Фиксированных высот нет: на 375px строка Georgia переносится в две строки.

## Тесты

**Unit (Jest), обязательны** — условный рендер по бизнес-логике:
- полоса рендерится при переданном id сессии и не рендерится без него;
- клик по крестику скрывает полосу и записывает в cookie именно id сессии (а не `true`);
- клик по действию отправляет `matching_strip_clicked`;
- ссылка ведёт на `/matching`.

**E2E (Playwright), обязателен** — новый UI-флоу с персистентным состоянием, поэтому каждый сценарий включает `page.reload()`:
- вошедший участник при открытой сессии видит полосу на `/`, переходит по ней на `/matching`;
- закрыл крестиком → `reload()` → полосы нет;
- гость полосы не видит; при закрытой сессии полосы нет.

Файл — новый `e2e/matching-strip.spec.ts`. Открытая сессия создаётся через фикстуры матчинга из `e2e/fixtures.ts`, изоляция от прод-БД — по правилам `docs/features/testing.md`. Помни про гочу `openMatchingPage`: фикстура только логинит, перед проверками нужен явный `page.goto('/')`.

**Layout (Playwright), обязателен** — это CSS-поведение (скрытие крестика и перестроение в колонку на ≤540px), а значит по правилам проекта нужен `boundingBox()`-тест в `e2e/catalog-layout.spec.ts`:
- на ≤540px крестика нет, а действие имеет высоту не меньше 44px;
- полоса не создаёт горизонтального скролла (`document.documentElement.scrollWidth - window.innerWidth <= 1`);
- полоса расположена ниже шапки и выше блока «Читательские круги».

**Осторожно с высотой.** Не привязывай проверки к абсолютной или разностной высоте полосы: в проекте уже протухал layout-тест, считавший, что карточка вырастет минимум на 20px. Проверяй расположение и вхождение элементов друг в друга, а не арифметику высот (`docs/features/testing.md`).

## Документация

- `docs/features/` — короткое описание условия показа и привязки cookie к id сессии.
- `docs/wiki/` — **обязательно**: меняется пользовательская фича (появляется вход в матчинг с главной).

## Контрольный список приёмки

- [ ] Полоса появляется на `/` под шапкой и выше блока «Читательские круги», не липкая.
- [ ] Видна только вошедшему и только при открытой сессии матчинга.
- [ ] Между сессиями и для гостя полосы нет; в шапке ничего не добавлено.
- [ ] «Перейти в матчинг →» ведёт на `/matching` и шлёт `matching_strip_clicked`.
- [ ] Крестик скрывает полосу; после перезагрузки она не возвращается; первый кадр без прыжка (решение принято на сервере).
- [ ] Cookie хранит id сессии: новая сессия матчинга возвращает полосу, даже если прошлую закрывали.
- [ ] На ≤540px полоса в две-три строки, тап-таргет действия 44px, крестика нет.
- [ ] Ни одного литерального цвета — только токены; скруглений и теней нет.
- [ ] Ни дедлайна, ни счётчиков, ни статуса круга, ни названия сессии в полосе.
- [ ] Падение запроса к БД не роняет главную.
