#!/usr/bin/env bash
# Проверяет staged .tsx/.ts файлы на сырые hex-цвета вне globals.css.
# Запускается через lint-staged — получает список файлов как аргументы.
#
# Запрещено:
#   style={{ color: '#111' }}
#   bg-[#fde8d8], text-[#C0603A], border-[#333]
#
# Разрешено: var(--…), className="text-accent" (токен-бридж в tailwind.config.ts)

set -euo pipefail

FILES=("$@")
if [ ${#FILES[@]} -eq 0 ]; then
  exit 0
fi

VIOLATIONS=$(grep -nE \
  "style=\{\{[^}]*#[0-9a-fA-F]{3,6}|(bg|text|border|color)-\[#[0-9a-fA-F]{3,6}\]" \
  "${FILES[@]}" 2>/dev/null \
  | grep -v "globals\.css" \
  | grep -v "styleguide/page\.tsx" \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo ""
  echo "❌ Сырой hex-цвет в компоненте. Используйте var(--…) из globals.css:"
  echo ""
  echo "$VIOLATIONS"
  echo ""
  echo "Карта замен: #111→var(--text), #C0603A→var(--accent), #E5E5E5→var(--border) и др."
  echo "Полный список: AGENTS.md → раздел «Токены»"
  echo ""
  exit 1
fi

exit 0
