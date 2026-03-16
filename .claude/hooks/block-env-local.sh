#!/bin/bash
# PreToolUse: блокирует правку .env.local (содержит секреты)

INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

if echo "$FILE" | grep -q "\.env\.local"; then
  echo "BLOCKED: .env.local содержит секреты (GH_TOKEN, NEXTAUTH_SECRET, ключи API) — редактировать только вручную"
  exit 2
fi
