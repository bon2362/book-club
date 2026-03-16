#!/bin/bash
# PostToolUse: запускает tsc после правки .ts/.tsx файлов

INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

case "$FILE" in
  *.ts|*.tsx)
    echo "=== TypeCheck ==="
    cd /workspace && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
    ;;
esac
