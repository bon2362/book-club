#!/bin/bash
# PreToolUse: проверяет Bash-команды на утечку секретов в GitHub Issues API
# Срабатывает только когда команда создаёт/обновляет issue через gh api

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('tool_input', {}).get('command', ''))
" 2>/dev/null)

# Проверяем только команды, которые пишут в issues/projects
if ! echo "$CMD" | grep -qE "gh api.*(issues|graphql).*(--(method|input)|POST|PATCH|PUT)"; then
  exit 0
fi

FOUND=""

# Паттерны секретов — высокая уверенность
check() {
  local pattern="$1"
  local label="$2"
  if echo "$CMD" | grep -qE "$pattern"; then
    FOUND="$FOUND\n  ⚠ $label"
  fi
}

# Реальные паттерны токенов и паролей
check "postgresql://[^@]+:[^@]+@" "Database URL с паролем (postgresql://user:pass@...)"
check "ghp_[A-Za-z0-9]{20,}" "GitHub токен (ghp_...)"
check "github_pat_[A-Za-z0-9_]{20,}" "GitHub fine-grained токен"
check "GOCSPX-[A-Za-z0-9_-]{20,}" "Google Client Secret"
check "re_[A-Za-z0-9]{20,}" "Resend API key (re_...)"
check "sk-[A-Za-z0-9]{20,}" "API key формата sk-..."
check "eyJ[A-Za-z0-9_-]{20,}\." "JWT токен"
check "npg_[A-Za-z0-9]{10,}" "Neon postgres пароль (npg_...)"

# Проверяем наличие значений из .env.local напрямую
if [ -f /workspace/.env.local ]; then
  while IFS='=' read -r key value; do
    # Пропускаем комментарии, пустые строки и публичные значения
    [[ "$key" =~ ^# ]] && continue
    [[ -z "$key" ]] && continue
    [[ "$key" =~ ^(NEXT_PUBLIC_|NEXTAUTH_URL$) ]] && continue
    [ ${#value} -lt 10 ] && continue  # Слишком короткие значения пропускаем

    if [ -n "$value" ] && echo "$CMD" | grep -qF "$value"; then
      FOUND="$FOUND\n  ⚠ Значение переменной $key из .env.local"
    fi
  done < /workspace/.env.local
fi

if [ -n "$FOUND" ]; then
  echo "BLOCKED: В команде обнаружены потенциальные секреты перед отправкой в GitHub API:"
  echo -e "$FOUND"
  echo ""
  echo "Если это ложное срабатывание — проверь команду вручную и выполни напрямую в терминале."
  exit 2
fi
