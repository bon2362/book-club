#!/bin/bash
# Инициализация GitHub Issues из BACKLOG.md
# Запускать один раз после настройки GH_TOKEN с правами repo + project
# Usage: bash /workspace/.claude/scripts/setup-github-issues.sh

set -e
export GH_TOKEN=$(grep GH_TOKEN /workspace/.env.local | cut -d= -f2)
REPO="bon2362/book-club"

if [ -z "$GH_TOKEN" ]; then
  echo "ERROR: GH_TOKEN не найден в .env.local"
  exit 1
fi

echo "=== Создание labels ==="

create_label() {
  local name="$1" color="$2" desc="$3"
  result=$(gh api /repos/$REPO/labels --method POST \
    -f name="$name" -f color="$color" -f description="$desc" 2>&1)
  if echo "$result" | grep -q '"name"'; then
    echo "  ✓ $name"
  elif echo "$result" | grep -q "already_exists"; then
    echo "  = $name (уже существует)"
  else
    echo "  ✗ $name: $result"
  fi
}

# Epic
create_label "epic:auth"    "0075ca" "Авторизация и профиль пользователя"
create_label "epic:ui"      "e4e669" "UI/UX улучшения"
create_label "epic:feature" "d93f0b" "Новая функциональность"
create_label "epic:infra"   "0e8a16" "Инфраструктура и DevOps"
create_label "epic:process" "5319e7" "Процессы разработки"

# Priority
create_label "priority:P1"  "b60205" "Высокий приоритет"
create_label "priority:P2"  "fbca04" "Средний приоритет"
create_label "priority:P3"  "c5def5" "Низкий приоритет"

# Status
create_label "status:todo"        "ededed" "Ещё не начато"
create_label "status:in-progress" "0052cc" "В работе"
create_label "status:blocked"     "e4e669" "Заблокировано"

# Size
create_label "size:XS" "f9d0c4" "Меньше часа"
create_label "size:S"  "fef2c0" "Полдня"
create_label "size:M"  "c2e0c6" "1-2 дня"
create_label "size:L"  "bfd4f2" "3+ дней"

echo ""
echo "=== Создание issues ==="

create_issue() {
  local title="$1" body="$2" labels="$3"
  result=$(gh api /repos/$REPO/issues \
    --method POST \
    -f title="$title" \
    -f body="$body" \
    --field labels="$labels" 2>&1)
  num=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('number','?'))" 2>/dev/null || echo "?")
  echo "  #$num $title"
}

# === Процессы разработки ===
create_issue \
  "#76 Swagger / OpenAPI документация API" \
  "Добавить автогенерацию OpenAPI-спецификации для всех route handlers в \`app/api/\`. Варианты: \`next-swagger-doc\` + \`swagger-ui-react\` (UI доступен по \`/api-docs\`), либо \`zod-to-openapi\` если хочется строгой типизации через zod-схемы." \
  '["epic:process","priority:P3","size:S","status:todo"]'

create_issue \
  "#75 UI Layout Tests — Playwright геометрические проверки" \
  "Добавить \`e2e/ui-states.spec.ts\` с хелперами \`isFullyAboveViewport\` / \`isFullyVisible\` и тестами на бокс-модель элементов в разных UI-стейтах. Обновить \`CLAUDE.md\`: для задач с CSS-поведением субагент обязан писать layout assertion тест перед коммитом." \
  '["epic:process","priority:P2","size:S","status:todo"]'

create_issue \
  "#32 Валидация env-переменных" \
  "\`process.env.X\` возвращает \`undefined\` без предупреждений — ошибка проявляется глубоко в рантайме. Добавить \`@t3-oss/env-nextjs\` или zod-схему: при отсутствии обязательной переменной сервер падает на старте с понятным сообщением." \
  '["epic:infra","priority:P2","size:S","status:todo"]'

create_issue \
  "#70 Система бэкапов" \
  "Автоматические резервные копии базы данных (Neon Postgres). Варианты: встроенные бэкапы Neon (PITR, платный план), либо cron-задача через GitHub Actions — pg_dump в зашифрованный архив в S3/R2/GitHub Releases." \
  '["epic:infra","priority:P2","size:M","status:todo"]'

create_issue \
  "#34 Мониторинг ошибок (Sentry)" \
  "Продакшен-ошибки видны только если пользователь сообщит. Подключить Sentry (\`@sentry/nextjs\`) — бесплатный tier достаточен. Даёт трассировку, контекст запроса и алерты на email при необработанных ошибках." \
  '["epic:infra","priority:P2","size:S","status:todo"]'

# === UI/UX ===
create_issue \
  "#64 Контекстные подсказки по мере использования сайта" \
  "После ключевых действий показывать пользователю короткие ситуативные подсказки.\n\nПримеры:\n- После первой записи на книгу: «Отлично! Ты записал:ась на книгу — как наберётся достаточно народа, мы соберём вас в общую телеграм-группу»\n- После второй записи: «Кстати, в личном кабинете можно расставить книги по приоритету»\n\nХранить факт просмотра в localStorage." \
  '["epic:ui","priority:P2","size:M","status:todo"]'

create_issue \
  "#22 Кнопка переключения тёмной темы" \
  "Тёмный режим работает через prefers-color-scheme, но пользователь не может переключить его вручную. Добавить кнопку в хедер (иконка солнца/луны), сохранять выбор в localStorage." \
  '["epic:ui","priority:P3","size:M","status:todo"]'

create_issue \
  "#23 Toast-уведомления об ошибках" \
  "Многие ошибки API молча проглатываются или меняют текст кнопки. Добавить простой toast-компонент (fixed div снизу экрана) для отображения ошибок и успешных действий." \
  '["epic:ui","priority:P2","size:S","status:todo"]'

create_issue \
  "#24 Пагинация или виртуализация списка книг" \
  "Все книги загружаются сразу. При 50+ книгах на мобильном это заметно. Добавить простую пагинацию или react-virtual для виртуализации длинного списка." \
  '["epic:ui","priority:P3","size:M","status:todo"]'

# === Авторизация ===
create_issue \
  "#68 Google One Tap" \
  "Автоматический всплывающий промпт от Google при загрузке главной страницы — незалогиненный пользователь с аккаунтом Google в браузере может войти одним кликом, без открытия AuthModal.\n\n[План реализации →](docs/superpowers/plans/2026-03-18-google-one-tap.md)" \
  '["epic:auth","priority:P1","size:S","status:todo"]'

create_issue \
  "#71 Выделение топ-3 в списке «Записал:ась»" \
  "В вкладке «Записал:ась» первые три места уже отмечены оранжевыми кружками. Идея: добавить эмодзи-медали (🥇🥈🥉) рядом с номером или отделить топ-3 визуальной чертой." \
  '["epic:auth","priority:P3","size:XS","status:todo"]'

create_issue \
  "#72 Заглушки вместо цифр до первой расстановки" \
  "До тех пор пока пользователь не переставил хотя бы одну книгу (priorities_set = false), вместо порядковых номеров отображать условные знаки — например ? или —." \
  '["epic:auth","priority:P3","size:XS","status:todo"]'

create_issue \
  "#73 Счётчик «на первом месте» на карточке книги" \
  "В каталоге книг рядом с общим числом записавшихся показывать, у скольких из них эта книга стоит на первом месте в рейтинге. Данные из таблицы book_priorities." \
  '["epic:feature","priority:P2","size:S","status:todo"]'

create_issue \
  "#4 Вход через Telegram" \
  "Добавить авторизацию через Telegram Login Widget как альтернативу Google OAuth и email magic link.\n\n**Статус:** заблокировано — Telegram не доставляет код авторизации в приложение. Виджет и конфигурация бота корректны, проблема на стороне Telegram OAuth." \
  '["epic:auth","priority:P3","size:L","status:blocked"]'

# === Функциональность ===
create_issue \
  "#42 Разбивка участников по группам (admin)" \
  "Администратор выбирает, как разбить участников, записавшихся на одну книгу, по группам для обсуждения. UI в admin-панели: список книг → участники → ручное распределение по группам (drag-and-drop или выпадающий список). Результат сохраняется и опционально рассылается по email." \
  '["epic:feature","priority:P1","size:L","status:todo"]'

create_issue \
  "#47 Саммари книги от участников" \
  "Авторизованный участник может написать короткое саммари (личные впечатления, выводы) по книге, которую клуб уже прочитал. Затрагивает: новая таблица book_summaries (bookId, userId, text, createdAt), новый API-эндпоинт, UI на карточке/странице книги." \
  '["epic:feature","priority:P2","size:L","status:todo"]'

echo ""
echo "=== Готово ==="
echo "Открой https://github.com/$REPO/issues чтобы увидеть созданные задачи"
echo "Затем создай GitHub Project на https://github.com/$REPO/projects"
