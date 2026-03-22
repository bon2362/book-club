#!/usr/bin/env python3
"""
Создаёт GitHub Issues из BACKLOG.md и добавляет их в GitHub Project.
Usage: python3 /workspace/.claude/scripts/create_issues.py
"""
import json
import subprocess
import os
import sys

BASE_URL = "https://github.com/bon2362/book-club/blob/main"
TOKEN = subprocess.check_output(
    "grep GH_TOKEN /workspace/.env.local | cut -d= -f2",
    shell=True, text=True
).strip()
REPO = "bon2362/book-club"
PROJECT_ID = "PVT_kwHOA8w2B84BSWWj"  # Slowreading Backlog

env = {**os.environ, "GH_TOKEN": TOKEN}

def api(path, method="GET", data=None):
    cmd = ["gh", "api", path, "--method", method]
    if data:
        cmd += ["--input", "-"]
    result = subprocess.run(
        cmd, input=json.dumps(data) if data else None,
        capture_output=True, text=True, env=env
    )
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr.strip()}")
        return None
    return json.loads(result.stdout) if result.stdout.strip() else {}

def graphql(query, variables=None):
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    result = subprocess.run(
        ["gh", "api", "graphql", "--input", "-"],
        input=json.dumps(payload),
        capture_output=True, text=True, env=env
    )
    if result.returncode != 0:
        print(f"  GraphQL ERROR: {result.stderr.strip()}")
        return None
    resp = json.loads(result.stdout)
    if "errors" in resp:
        print(f"  GraphQL errors: {resp['errors']}")
        return None
    return resp.get("data")

def create_issue(title, body, labels, state="open"):
    data = {"title": title, "body": body, "labels": labels}
    result = api(f"/repos/{REPO}/issues", "POST", data)
    if result and "number" in result:
        num = result["number"]
        node_id = result["node_id"]
        print(f"  ✓ #{num} {title[:60]}")
        # Close if needed
        if state == "closed":
            api(f"/repos/{REPO}/issues/{num}", "PATCH", {"state": "closed"})
        return num, node_id
    return None, None

def add_to_project(issue_node_id):
    data = graphql("""
        mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
            item { id }
          }
        }
    """, {"projectId": PROJECT_ID, "contentId": issue_node_id})
    if data:
        return data.get("addProjectV2ItemById", {}).get("item", {}).get("id")
    return None

# ==============================================================
# BACKLOG — открытые задачи
# ==============================================================
OPEN_ISSUES = [
    # === Процессы разработки ===
    {
        "title": "#76 Swagger / OpenAPI документация API",
        "body": "Добавить автогенерацию OpenAPI-спецификации для всех route handlers в `app/api/`.\n\nВарианты: `next-swagger-doc` + `swagger-ui-react` (UI доступен по `/api-docs`), либо `zod-to-openapi` если хочется строгой типизации через zod-схемы.\n\nДаёт возможность быстро ревьюить все эндпоинты, их параметры и ответы без чтения кода.",
        "labels": ["epic:process", "priority:P3", "size:S", "status:todo"],
    },
    {
        "title": "#75 UI Layout Tests — Playwright геометрические проверки",
        "body": "Добавить `e2e/ui-states.spec.ts` с хелперами `isFullyAboveViewport` / `isFullyVisible` и тестами на бокс-модель элементов в разных UI-стейтах.\n\nОбновить `CLAUDE.md` и шаблон планов: для задач с CSS-поведением субагент обязан писать layout assertion тест перед коммитом.\n\nПодробный разбор: [docs/ui-layout-testing-postmortem.md](https://github.com/bon2362/book-club/blob/main/docs/ui-layout-testing-postmortem.md)",
        "labels": ["epic:process", "priority:P2", "size:S", "status:todo"],
    },
    {
        "title": "#32 Валидация env-переменных",
        "body": "`process.env.X` возвращает `undefined` без предупреждений — ошибка проявляется глубоко в рантайме.\n\nДобавить `@t3-oss/env-nextjs` или zod-схему: при отсутствии обязательной переменной сервер падает на старте с понятным сообщением.",
        "labels": ["epic:infra", "priority:P2", "size:S", "status:todo"],
    },
    {
        "title": "#70 Система бэкапов",
        "body": "Автоматические резервные копии базы данных (Neon Postgres).\n\nВарианты:\n- Встроенные бэкапы Neon (Point-in-Time Recovery, доступен на платных планах)\n- cron-задача через GitHub Actions — pg_dump в зашифрованный архив в S3/R2/GitHub Releases\n\nОпределить частоту (ежедневно?), срок хранения и процедуру восстановления.",
        "labels": ["epic:infra", "priority:P2", "size:M", "status:todo"],
    },
    {
        "title": "#34 Мониторинг ошибок (Sentry)",
        "body": "Продакшен-ошибки видны только если пользователь сообщит.\n\nПодключить Sentry (`@sentry/nextjs`) — бесплатный tier достаточен. Даёт трассировку, контекст запроса и алерты на email при необработанных ошибках.",
        "labels": ["epic:infra", "priority:P2", "size:S", "status:todo"],
    },
    # === UI/UX ===
    {
        "title": "#64 Контекстные подсказки по мере использования сайта",
        "body": "После ключевых действий показывать пользователю короткие ситуативные подсказки.\n\n**Примеры:**\n- После первой записи: «Отлично! Ты записал:ась на книгу — как наберётся достаточно народа, мы соберём вас в общую телеграм-группу»\n- После второй записи: «Кстати, в личном кабинете можно расставить книги по приоритету»\n\nФормат открытый: toast снизу, inline-блок, баннер в drawer'е. Хранить факт просмотра в localStorage.",
        "labels": ["epic:ui", "priority:P2", "size:M", "status:todo"],
    },
    {
        "title": "#22 Кнопка переключения тёмной темы",
        "body": "Тёмный режим работает через `prefers-color-scheme`, но пользователь не может переключить его вручную.\n\nДобавить кнопку в хедер (иконка солнца/луны), сохранять выбор в `localStorage`.",
        "labels": ["epic:ui", "priority:P3", "size:M", "status:todo"],
    },
    {
        "title": "#23 Toast-уведомления об ошибках",
        "body": "Многие ошибки API молча проглатываются или меняют текст кнопки — пользователь может не понять, что что-то пошло не так.\n\nДобавить простой toast-компонент (fixed div снизу экрана) для отображения ошибок и успешных действий.",
        "labels": ["epic:ui", "priority:P2", "size:S", "status:todo"],
    },
    {
        "title": "#24 Пагинация или виртуализация списка книг",
        "body": "Все книги загружаются сразу. При 50+ книгах на мобильном это заметно.\n\nДобавить простую пагинацию или `react-virtual` для виртуализации длинного списка.",
        "labels": ["epic:ui", "priority:P3", "size:M", "status:todo"],
    },
    # === Авторизация ===
    {
        "title": "#68 Google One Tap",
        "body": "Автоматический всплывающий промпт от Google при загрузке главной страницы — незалогиненный пользователь с аккаунтом Google в браузере может войти одним кликом, без открытия AuthModal.\n\nНовый Credentials provider в NextAuth, верификация JWT через `google-auth-library`, создание записей в `users` + `accounts` для новых пользователей.\n\n[План реализации →](https://github.com/bon2362/book-club/blob/main/docs/superpowers/plans/2026-03-18-google-one-tap.md)",
        "labels": ["epic:auth", "priority:P1", "size:S", "status:todo"],
    },
    {
        "title": "#71 Выделение топ-3 в списке «Записал:ась»",
        "body": "В вкладке «Записал:ась» личного кабинета первые три места уже отмечены оранжевыми кружками с номером.\n\nИдея: сделать разграничение более явным — добавить эмодзи-медали (🥇🥈🥉) рядом с номером или отделить топ-3 визуальной чертой от остального списка.",
        "labels": ["epic:auth", "priority:P3", "size:XS", "status:todo"],
    },
    {
        "title": "#72 Заглушки вместо цифр до первой расстановки",
        "body": "До тех пор пока пользователь не переставил хотя бы одну книгу (`priorities_set = false`), вместо порядковых номеров `1`, `2`, `3`... отображать условные знаки — например `?` или `—`.\n\nЭто подчёркивает, что порядок ещё не задан и мотивирует его расставить.",
        "labels": ["epic:auth", "priority:P3", "size:XS", "status:todo"],
    },
    {
        "title": "#73 Счётчик «на первом месте» на карточке книги",
        "body": "В каталоге книг рядом с общим числом записавшихся показывать, у скольких из них эта книга стоит на **первом месте** в рейтинге.\n\nДанные из таблицы `book_priorities`. Помогает оценить реальный интерес: не просто «записался», а «очень хочу».",
        "labels": ["epic:feature", "priority:P2", "size:S", "status:todo"],
    },
    {
        "title": "#4 Вход через Telegram",
        "body": "Добавить авторизацию через Telegram Login Widget как альтернативу Google OAuth и email magic link.\n\nЕсли пользователь вошёл через Telegram — не запрашивать Telegram-контакт отдельно, а подставлять его автоматически.\n\n**Статус:** заблокировано — Telegram не доставляет код авторизации в приложение. Виджет и конфигурация бота корректны, проблема на стороне Telegram OAuth. Оставлено до выяснения.",
        "labels": ["epic:auth", "priority:P3", "size:L", "status:blocked"],
    },
    # === Функциональность ===
    {
        "title": "#42 Разбивка участников по группам (admin)",
        "body": "Администратор выбирает, как разбить участников, записавшихся на одну книгу, по группам для обсуждения.\n\nUI в admin-панели: список книг → участники → ручное распределение по группам (drag-and-drop или выпадающий список). Результат сохраняется и опционально рассылается участникам группы по email.",
        "labels": ["epic:feature", "priority:P1", "size:L", "status:todo"],
    },
    {
        "title": "#47 Саммари книги от участников",
        "body": "Авторизованный участник может написать короткое саммари (личные впечатления, выводы) по книге, которую клуб уже прочитал.\n\nСаммари привязано к книге и пользователю. Несколько участников могут оставить саммари по одной книге.\n\nЗатрагивает: новая таблица `book_summaries` (bookId, userId, text, createdAt), новый API-эндпоинт, UI на карточке/странице книги.",
        "labels": ["epic:feature", "priority:P2", "size:L", "status:todo"],
    },
]

# ==============================================================
# ВЫПОЛНЕНО — закрытые задачи
# ==============================================================
DONE_ISSUES = [
    {
        "title": "#77 Виджет статуса дайджеста уведомлений в подвале admin-панели",
        "body": "`/api/admin/digest-status` читает `notification_queue` (только неотправленные и незахваченные строки), вычисляет статус дебаунса (empty / ready / cooling).\n\n`DigestStatusWidget` — client component с polling каждые 60с, цветные точки, отображает количество запланированных писем и время до отправки. Вставлен под `AdminStatusBar` в подвале `/admin`.",
        "labels": ["epic:feature", "priority:P2", "size:S"],
    },
    {
        "title": "#74 Группировка email-уведомлений о новых записях",
        "body": "Таблица `notification_queue` в Postgres. `/api/signup` пишет в очередь вместо немедленной отправки.\n\nGitHub Actions workflow (`digest.yml`, каждые 10 мин) вызывает `GET /api/cron/digest`, который атомарно захватывает строки, проверяет дебаунс (30 мин тишины или 2 ч принудительно) и шлёт один дайджест через Resend. Защита через `CRON_SECRET` в заголовке Authorization. Vercel Cron не используется (ограничения Hobby-плана).",
        "labels": ["epic:feature", "priority:P1", "size:M"],
    },
    {
        "title": "#69 Скрытие шапки при скролле вниз",
        "body": "`ScrollHideContext` с одним passive scroll listener на уровне layout. Шапка (`overflow: hidden` + inner wrapper с `transform: translateY(-100%)`) и строка фильтров (`position: sticky` + синхронный `translateY`) скрываются при скролле вниз >60px, появляются при скролле вверх. CSS-переменная `--header-height` устанавливается через `ResizeObserver`.\n\nНовые файлы: `lib/scroll-hide-context.tsx`. Изменены: `app/layout.tsx`, `components/nd/Header.tsx`, `components/nd/BooksPage.tsx`.",
        "labels": ["epic:ui", "priority:P2", "size:M"],
    },
    {
        "title": "#68 Google One Tap — план",
        "body": "Создан план реализации: [docs/superpowers/plans/2026-03-18-google-one-tap.md](https://github.com/bon2362/book-club/blob/main/docs/superpowers/plans/2026-03-18-google-one-tap.md)\n\n_Сама реализация — отдельная задача #68._",
        "labels": ["epic:auth", "priority:P1", "size:XS"],
    },
    {
        "title": "#66 Email в профиле — не кликабельная ссылка",
        "body": "Добавлен `formatDetection: { email: false }` в metadata в `app/layout.tsx` — iOS Safari больше не автолинкует email в профиле.",
        "labels": ["epic:ui", "priority:P3", "size:XS"],
    },
    {
        "title": "#67 Имя в заголовке профиля из поля «Имя»",
        "body": "`displayName` в `ProfileDrawer` теперь берёт `effectiveUser?.name` (из БД) в первую очередь, затем `session?.user?.name` (Google), затем `session?.user?.email` (magic link).",
        "labels": ["epic:auth", "priority:P2", "size:XS"],
    },
    {
        "title": "#65 Форма обратной связи",
        "body": "Кнопка «Написать автору проекта» в футере открывает модальную форму. Поля: сообщение (обязательное), имя и email (опциональные, предзаполняются для залогиненных). При отправке без email — предупреждение с «Отправить всё равно». Письма отправляются на `hello@slowreading.club` через Resend.\n\nНовые файлы: `components/nd/Footer.tsx`, `components/nd/FeedbackForm.tsx`, `app/api/feedback/route.ts`.",
        "labels": ["epic:feature", "priority:P2", "size:S"],
    },
    {
        "title": "#64 Контекстные подсказки — в очереди",
        "body": "Задача перенесена в активный бэклог как #64.",
        "labels": ["epic:ui", "priority:P2", "size:M"],
    },
    {
        "title": "#61 Отображение приоритетов в admin-панели",
        "body": "Вкладка **Участники**: бейджи книг показывают приоритет пользователя — чёрный префикс `#1`, `#2`… для расставленных книг, серый `+` для книг добавленных после расстановки, серый `?` с подписью «Приоритеты не расставлены» для пользователей без приоритетов.\n\nВкладка **По книгам**: рядом с именем каждого участника показывается его приоритет `(#N)`. При удалении книги — приоритеты автоматически пересчитываются (re-rank).",
        "labels": ["epic:feature", "priority:P2", "size:M"],
    },
    {
        "title": "#59 Личный кабинет: последняя книга на мобиле",
        "body": "`paddingBottom: 1rem` на скроллируемом контейнере вкладки «Записал:ась» в ProfileDrawer — последняя карточка теперь полностью видна при прокрутке.",
        "labels": ["epic:ui", "priority:P3", "size:XS"],
    },
    {
        "title": "#60 About-блок и шапка: кнопка «Что это?»",
        "body": "Кнопка «Что это?» в шапке отображается только когда About-блок скрыт. Eyebrow внутри блока переименован с «Читательские круги» на «Что это».",
        "labels": ["epic:ui", "priority:P3", "size:XS"],
    },
    {
        "title": "#58 Фильтр «Записался» + тултип; фильтр «Прочитанные»",
        "body": "Фильтр «Мои книги» переименован в «Записался» с тултипом «Книги, на которые вы записались». Фильтр «Прочитанные» теперь работает как «Новинки» — показывает только прочитанные книги, а не добавляет их к общему списку.",
        "labels": ["epic:ui", "priority:P2", "size:XS"],
    },
    {
        "title": "#57 Новые книги в начале списка",
        "body": "Книги из заявок сортируются по `createdAt` desc. Книги из Google Sheets реверсируются. В итоговом списке: сначала одобренные заявки (по дате), затем книги из Sheets в обратном порядке строк.",
        "labels": ["epic:feature", "priority:P2", "size:XS"],
    },
    {
        "title": "#56 Приём входящих писем на @slowreading.club",
        "body": "Namecheap Email Forwarding: входящие на `hello@slowreading.club` пересылаются на личный Gmail. Отправка с `hello@slowreading.club` настроена через Gmail «Send mail as» + Resend SMTP.",
        "labels": ["epic:infra", "priority:P2", "size:S"],
    },
    {
        "title": "#55 Виджеты CI и деплоя в подвале admin-панели",
        "body": "`/api/admin/status` параллельно запрашивает GitHub Actions API и Vercel API. `AdminStatusBar` — client component с polling каждые 60с, цветные точки статуса. Вставлен в подвал `/admin`.",
        "labels": ["epic:infra", "priority:P2", "size:S"],
    },
    {
        "title": "#54 Личный кабинет пользователя",
        "body": "Drawer справа, открывается по клику на имя пользователя в шапке. Три вкладки:\n- **Записал:ась** — книги с кнопкой × для отписки\n- **Предложил:а** — заявки на книги со статусами\n- **Профиль** — форма имени и Telegram, языковые предпочтения, выход\n\nГендергэпы во всём интерфейсе. Toast-уведомления для всех действий.",
        "labels": ["epic:feature", "priority:P1", "size:L"],
    },
    {
        "title": "#53 Форма «Предложить книгу» открывается после OAuth-редиректа",
        "body": "`submitIntent` сохраняется в `localStorage` перед редиректом. При маунте `BooksPage` проверяет ключ — если есть, открывает форму и удаляет ключ.",
        "labels": ["epic:feature", "priority:P2", "size:XS"],
    },
    {
        "title": "#52 Ярлык «Новая» + фильтр по новинкам",
        "body": "Новая таблица `book_new_flags` в БД. Для книг из заявок — авто-флаг 30 дней. Badge «Новая» на карточках. Кнопка-фильтр «Новинки» в каталоге. Тумблер в admin-панели.",
        "labels": ["epic:feature", "priority:P2", "size:M"],
    },
    {
        "title": "#51 Фильтр «Мои книги»",
        "body": "Кнопка «Мои книги» в строке фильтров для залогиненных пользователей с хотя бы одной записью. Фильтрует по `selectedBooks`.",
        "labels": ["epic:ui", "priority:P2", "size:XS"],
    },
    {
        "title": "#50 Кнопка «Предложить книгу» в табличном виде",
        "body": "Строка-кнопка «+ Предложить книгу» первой в таблице при табличном виде каталога.",
        "labels": ["epic:ui", "priority:P3", "size:XS"],
    },
    {
        "title": "#49 Предзаполнение формы из активных фильтров",
        "body": "При открытии формы «Предложить книгу» передаются `filterTag` → поле «Тема» и `filterAuthor` → поле «Писатель».",
        "labels": ["epic:feature", "priority:P3", "size:XS"],
    },
    {
        "title": "#48 Умная фильтрация по автору — поиск по вхождению",
        "body": "Поле `author` разбивается по `,` / `и` / `&` на отдельные имена. Фильтр проверяет вхождение выбранного имени. `searchBooks` сделан generic.",
        "labels": ["epic:feature", "priority:P2", "size:XS"],
    },
    {
        "title": "#46 Поле «Почему стоит прочитать» на карточке книги",
        "body": "Отображается при раскрытии карточки в стиле цитаты: вертикальная оранжевая черта слева, тёплый фон, курсивный текст. Работает для книг из заявок и из Google Sheets.",
        "labels": ["epic:ui", "priority:P2", "size:S"],
    },
    {
        "title": "#45 Колонка «Why for club» в Google Sheets",
        "body": "Колонка M (индекс 12) считывается в `lib/sheets.ts` как `whyForClub`, передаётся в `BookWithCover.whyRead`.",
        "labels": ["epic:feature", "priority:P2", "size:XS"],
    },
    {
        "title": "#44 Удаление заявки на книгу администратором",
        "body": "Кнопка «Удалить» в раскрытой строке заявки на вкладке «Заявки» admin-панели. Inline-подтверждение. `DELETE /api/admin/submissions/[id]`.",
        "labels": ["epic:feature", "priority:P2", "size:S"],
    },
    {
        "title": "#43 Причина отказа заявки",
        "body": "Текстовое поле в admin-панели при отклонении заявки. Причина сохраняется в `book_submissions.rejection_reason` и отправляется пользователю в email.",
        "labels": ["epic:feature", "priority:P2", "size:S"],
    },
    {
        "title": "#42 Ранжированное голосование за книги",
        "body": "Drag-and-drop расстановка приоритетов в личном кабинете (вкладка «Записал:ась»). Порядок книг сохраняется в `book_priorities`. Топ-3 отмечены оранжевыми кружками. Автосохранение с debounce 500 мс.",
        "labels": ["epic:feature", "priority:P1", "size:L"],
    },
    {
        "title": "#40 Залипающая кнопка сабмита в форме «Предложить книгу»",
        "body": "Форма переработана: заголовок и кнопка «Отправить» зафиксированы, область с полями прокручивается независимо.",
        "labels": ["epic:ui", "priority:P3", "size:XS"],
    },
    {
        "title": "#39 Убрать кнопку «Предложить книгу» из шапки на мобильных",
        "body": "Кнопка скрыта на мобильных (≤540px) через класс `nd-header-submit` + `display: none` в медиазапросе.",
        "labels": ["epic:ui", "priority:P3", "size:XS"],
    },
    {
        "title": "#38 Прочитанные книги: запись открыта, но скрыты по умолчанию",
        "body": "Переключатель «Показать прочитанные» в фильтрах. Книги со статусом «read» скрыты по умолчанию, но запись на них разрешена.",
        "labels": ["epic:feature", "priority:P2", "size:S"],
    },
    {
        "title": "#37 Компактная шапка — объединить элементы",
        "body": "Имя пользователя и кнопка «Профиль» объединены в один кликабельный элемент. Кнопка «Выйти» заменена на SVG-иконку. На мобиле — аватар-кружок с инициалом.",
        "labels": ["epic:ui", "priority:P2", "size:S"],
    },
    {
        "title": "#36 Монтирование ~/.claude в devcontainer",
        "body": "`~/.claude` монтируется через named volume `claude-code-config-book-club`. Данные сохраняются между `Rebuild Container` — память и настройки Claude не теряются.",
        "labels": ["epic:infra", "priority:P2", "size:S"],
    },
    {
        "title": "#35 E2E тесты (Playwright)",
        "body": "Playwright добавлен для проверки авторизации и полного флоу нового пользователя. Тесты запускаются в CI. Google Sheets и upsertSignup замоканы через `NEXTAUTH_TEST_MODE=true`.",
        "labels": ["epic:process", "priority:P1", "size:M"],
    },
    {
        "title": "#34 Мониторинг — в очереди",
        "body": "Задача перенесена в активный бэклог.",
        "labels": ["epic:infra", "priority:P2", "size:S"],
    },
    {
        "title": "#33 Тесты для критичных route handlers",
        "body": "Покрыты: `/api/signup`, `/api/admin/remove-book`, `/api/admin/delete-user`. Итого 45 тестов, всё зелёное в CI.",
        "labels": ["epic:process", "priority:P1", "size:M"],
    },
    {
        "title": "#31 Husky + lint-staged",
        "body": "`husky` + `lint-staged` в devDependencies. Pre-commit хук запускает `eslint --max-warnings 0` + `tsc --noEmit` на staged `.ts/.tsx` файлах.",
        "labels": ["epic:process", "priority:P1", "size:S"],
    },
    {
        "title": "#30 GitHub Actions CI",
        "body": "`.github/workflows/ci.yml` с pipeline `lint → typecheck → test → build`. Запускается при push в main и в PR.",
        "labels": ["epic:process", "priority:P1", "size:S"],
    },
    {
        "title": "#29 .env.local в .gitignore",
        "body": "`.env*.local` добавлен в `.gitignore`. В истории git файл никогда не появлялся.",
        "labels": ["epic:infra", "priority:P1", "size:XS"],
    },
    {
        "title": "#28 Скрипт typecheck",
        "body": "Добавлен `\"typecheck\": \"tsc --noEmit\"` в `package.json`. TypeScript в `strict: true`.",
        "labels": ["epic:process", "priority:P2", "size:XS"],
    },
    {
        "title": "#27 .prettierrc в репозитории",
        "body": "`.prettierrc`: `semi: false`, `singleQuote: true`, `trailingComma: es5`, `printWidth: 100`.",
        "labels": ["epic:process", "priority:P2", "size:XS"],
    },
    {
        "title": "#26 Email-уведомление организатору при новой записи",
        "body": "`upsertSignup` возвращает `{ isNew, addedBooks }`. При добавлении книг отправляется письмо на `ADMIN_EMAIL` через Resend. Отправка не блокирует ответ.",
        "labels": ["epic:feature", "priority:P1", "size:S"],
    },
    {
        "title": "#25 Аналитика посещаемости",
        "body": "Подключён `@vercel/analytics`. Компонент `<Analytics />` в `app/layout.tsx`. Данные в дашборде Vercel → Analytics.",
        "labels": ["epic:infra", "priority:P2", "size:XS"],
    },
    {
        "title": "#21 Оптимизация изображений обложек",
        "body": "`CoverImage.tsx` переведён на `<Image fill>` из `next/image` с `sizes`. В `next.config.mjs` добавлен `images.remotePatterns` с `hostname: '**'`.",
        "labels": ["epic:ui", "priority:P2", "size:S"],
    },
    {
        "title": "#20 Open Graph теги",
        "body": "Добавлены `og:title`, `og:description`, `og:siteName`, `og:locale`, `og:type` и Twitter Card в `app/layout.tsx`.",
        "labels": ["epic:ui", "priority:P2", "size:XS"],
    },
    {
        "title": "#19 Раскрытие описания книги по клику на текст",
        "body": "В карточке книги описание раскрывается/сворачивается кнопками «Читать далее» и «Свернуть». Добавлен клик по самому тексту описания. Курсор меняется на pointer.",
        "labels": ["epic:ui", "priority:P3", "size:XS"],
    },
    {
        "title": "#18 Кнопка «Наверх» на мобильных",
        "body": "Залипающая круглая кнопка ↑ в правом нижнем углу. Видна только на мобильных (`max-width: 768px`). Появляется когда пролистал вниз больше 2 экранов.",
        "labels": ["epic:ui", "priority:P3", "size:S"],
    },
    {
        "title": "#17 Переезд на домен slowreading.club",
        "body": "Vercel, Namecheap DNS, Google OAuth и `NEXTAUTH_URL` настроены. Домен `slowreading.club` — основной.",
        "labels": ["epic:infra", "priority:P1", "size:M"],
    },
    {
        "title": "#16 Вход через magic link",
        "body": "Email-поле + кнопка «Получить ссылку на почту» в `AuthModal`. Письма через Resend с `noreply@slowreading.club`. Кастомный HTML-шаблон. Домен верифицирован в Resend и Google Postmaster Tools.",
        "labels": ["epic:auth", "priority:P1", "size:M"],
    },
    {
        "title": "#15 Переключение вида списка книг: сетка / таблица",
        "body": "Иконки-переключатели в строке фильтров. По умолчанию — сетка карточек. Табличный вид: компактные строки без обложек, цветная полоска статуса, название + год + автор, теги, страницы + ссылка, счётчик, кнопка действия. Выбор в `localStorage`.",
        "labels": ["epic:ui", "priority:P2", "size:M"],
    },
    {
        "title": "#14 Удаление пользователя администратором",
        "body": "Кнопка «Удалить» в таблице участников с диалогом подтверждения. Удаляет пользователя из Postgres (каскадно). JWT callback проверяет существование пользователя — при отсутствии разлогинивает.",
        "labels": ["epic:feature", "priority:P1", "size:M"],
    },
    {
        "title": "#13 Снятие пользователя с книги администратором",
        "body": "В панели администратора на вкладке «Участники» кнопка-крестик рядом с каждой книгой. Диалог подтверждения, удаление из Google Sheets, оптимистичное обновление UI.",
        "labels": ["epic:feature", "priority:P1", "size:S"],
    },
    {
        "title": "#12 Подвал с информацией о деплое на /admin",
        "body": "Дата и время последнего деплоя (CET), короткий хеш коммита со ссылкой на GitHub, сообщение коммита. Позволяет убедиться, что свежие изменения уже на сайте.",
        "labels": ["epic:infra", "priority:P2", "size:S"],
    },
    {
        "title": "#11 Счётчик записавшихся на книгу",
        "body": "Показывает на карточке книги (и в admin-панели), сколько человек записалось на каждую книгу.",
        "labels": ["epic:feature", "priority:P2", "size:S"],
    },
    {
        "title": "#9 Число страниц и ссылка на файл в карточке",
        "body": "Отображение числа страниц и ссылки на файл с книгой (поля уже есть в Google Sheets — колонки Pages и Link).",
        "labels": ["epic:ui", "priority:P3", "size:XS"],
    },
    {
        "title": "#8 Загрузка книг пользователями",
        "body": "Участники могут предлагать книги через форму «Предложить книгу». Заявки попадают в admin-панель на модерацию.",
        "labels": ["epic:feature", "priority:P1", "size:L"],
    },
    {
        "title": "#7 Редактирование контактов",
        "body": "Возможность для участника редактировать свои данные (имя, Telegram) после регистрации.",
        "labels": ["epic:auth", "priority:P1", "size:S"],
    },
    {
        "title": "#6 Удаление аккаунта пользователем",
        "body": "Возможность для участника самостоятельно удалить свой аккаунт с сайта.",
        "labels": ["epic:auth", "priority:P2", "size:S"],
    },
    {
        "title": "#3 Статусы книг",
        "body": "Возможность отмечать книги как прочитанные и закрытые для записи. Участники видят, что запись на книгу недоступна.",
        "labels": ["epic:feature", "priority:P1", "size:M"],
    },
    {
        "title": "#1 Описание проекта (About-блок)",
        "body": "Блок с текстом «Я, Евгений, приглашаю вместе читать и обсуждать книги...» между хедером и строкой поиска. Кнопка × скрывает блок; выбор сохраняется в куке `about_closed=1` на год.",
        "labels": ["epic:ui", "priority:P2", "size:S"],
    },
]

def main():
    print("=== Создание открытых задач (бэклог) ===")
    issue_node_ids = []
    for issue in OPEN_ISSUES:
        num, node_id = create_issue(issue["title"], issue["body"], issue["labels"], "open")
        if node_id:
            issue_node_ids.append(node_id)

    print(f"\n=== Создание закрытых задач (выполнено) ===")
    for issue in DONE_ISSUES:
        num, node_id = create_issue(issue["title"], issue["body"], issue["labels"], "closed")
        if node_id:
            issue_node_ids.append(node_id)

    print(f"\n=== Добавление {len(issue_node_ids)} задач в проект ===")
    added = 0
    for node_id in issue_node_ids:
        item_id = add_to_project(node_id)
        if item_id:
            added += 1

    print(f"  Добавлено: {added}/{len(issue_node_ids)}")
    print(f"\n✓ Готово! Открой: https://github.com/users/bon2362/projects/1")

if __name__ == "__main__":
    main()
