#!/bin/bash
# PostToolUse: запускает ESLint после правки .ts/.tsx файлов

INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

case "$FILE" in
  *.ts|*.tsx)
    echo "=== ESLint ==="
    cd /workspace && npx eslint "$FILE" --max-warnings 0 2>&1
    ;;
esac
