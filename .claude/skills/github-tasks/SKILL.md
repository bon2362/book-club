---
name: github-tasks
description: Управление задачами через GitHub Issues. Используй перед началом любой задачи из бэклога, при запросе статуса задач, или когда нужно создать/закрыть задачу.
---

# GitHub Tasks Skill

Этот skill управляет задачами проекта через GitHub Issues.
GH_TOKEN берётся из `/workspace/.env.local`.

## Настройка токена

```bash
export GH_TOKEN=$(grep GH_TOKEN /workspace/.env.local | cut -d= -f2)
```

## Команды

### Просмотр задач

**Все открытые задачи:**
```bash
export GH_TOKEN=$(grep GH_TOKEN /workspace/.env.local | cut -d= -f2)
gh api /repos/bon2362/book-club/issues?state=open\&per_page=50 \
  --jq '.[] | "#\(.number) [\(.labels | map(.name) | join(", "))] \(.title)"'
```

**По эпику** (например `epic:ui`):
```bash
gh api "/repos/bon2362/book-club/issues?state=open&labels=epic:ui&per_page=30" \
  --jq '.[] | "#\(.number) \(.title) [\(.labels | map(.name) | join(", "))]"'
```

**Задачи в работе:**
```bash
gh api "/repos/bon2362/book-club/issues?state=open&labels=status:in-progress&per_page=30" \
  --jq '.[] | "#\(.number) \(.title)"'
```

### Перед началом задачи

1. Найди issue по номеру или теме
2. Прочитай body issue для контекста
3. Переведи в статус in-progress (удали `status:todo`, добавь `status:in-progress`):

```bash
export GH_TOKEN=$(grep GH_TOKEN /workspace/.env.local | cut -d= -f2)
ISSUE_NUM=<номер>

# Получить текущие labels (исключить status:todo)
LABELS=$(gh api /repos/bon2362/book-club/issues/$ISSUE_NUM \
  --jq '[.labels[].name | select(startswith("status:") | not)] + ["status:in-progress"] | join(",")' 2>/dev/null)

# Обновить labels
gh api /repos/bon2362/book-club/issues/$ISSUE_NUM \
  --method PATCH \
  --field labels="$LABELS" 2>&1
```

### После выполнения задачи

Закрыть issue:
```bash
export GH_TOKEN=$(grep GH_TOKEN /workspace/.env.local | cut -d= -f2)
gh api /repos/bon2362/book-club/issues/<ISSUE_NUM> \
  --method PATCH \
  -f state=closed 2>&1
```

Добавить комментарий с описанием что сделано:
```bash
gh api /repos/bon2362/book-club/issues/<ISSUE_NUM>/comments \
  --method POST \
  -f body="Реализовано в коммите <hash>: <краткое описание>" 2>&1
```

### Создать новую задачу

```bash
export GH_TOKEN=$(grep GH_TOKEN /workspace/.env.local | cut -d= -f2)
gh api /repos/bon2362/book-club/issues \
  --method POST \
  -f title="<заголовок>" \
  -f body="<описание>" \
  --field labels='["epic:<epic>","priority:P2","size:<XS|S|M|L>","status:todo"]' 2>&1 | \
  jq '{number: .number, title: .title, url: .html_url}'
```

## Label система

| Тип | Значения |
|-----|----------|
| **epic** | `epic:auth`, `epic:ui`, `epic:feature`, `epic:infra`, `epic:process` |
| **priority** | `priority:P1` (высокий), `priority:P2` (средний), `priority:P3` (низкий) |
| **size** | `size:XS` (<1ч), `size:S` (полдня), `size:M` (1-2 дня), `size:L` (3+ дней) |
| **status** | `status:todo`, `status:in-progress`, `status:blocked` |

## Workflow

Перед реализацией задачи из бэклога:
1. Найди соответствующий issue (`gh api /repos/bon2362/book-club/issues?state=open`)
2. Прочитай body для полного контекста требований
3. Переведи в `status:in-progress`
4. После коммита — закрой issue с комментарием

## Инициализация (один раз после обновления токена)

Если issues ещё не созданы, запусти скрипт:
```bash
bash /workspace/.claude/scripts/setup-github-issues.sh
```
