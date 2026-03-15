#!/bin/bash
# PostToolUse hook: after git push — wait for CI and print result

# Read tool input from stdin
INPUT=$(cat)

# Check if this was a git push command
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)

if ! echo "$COMMAND" | grep -q "git push"; then
  exit 0
fi

# Wait for the run to appear (push may take a moment to register)
sleep 3

echo "=== CI: waiting for GitHub Actions run ==="

# Wait up to 3 minutes for the run to complete
for i in $(seq 1 36); do
  STATUS=$(gh run list --limit 1 --json status,conclusion,name,url 2>/dev/null)
  RUN_STATUS=$(echo "$STATUS" | python3 -c "import sys,json; r=json.load(sys.stdin)[0]; print(r['status'])" 2>/dev/null)
  RUN_CONCLUSION=$(echo "$STATUS" | python3 -c "import sys,json; r=json.load(sys.stdin)[0]; print(r.get('conclusion',''))" 2>/dev/null)
  RUN_NAME=$(echo "$STATUS" | python3 -c "import sys,json; r=json.load(sys.stdin)[0]; print(r['name'])" 2>/dev/null)
  RUN_URL=$(echo "$STATUS" | python3 -c "import sys,json; r=json.load(sys.stdin)[0]; print(r['url'])" 2>/dev/null)

  if [ "$RUN_STATUS" = "completed" ]; then
    if [ "$RUN_CONCLUSION" = "success" ]; then
      echo "✓ CI passed: $RUN_NAME"
    else
      echo "✗ CI FAILED ($RUN_CONCLUSION): $RUN_NAME"
      echo "  $RUN_URL"
      gh run view --log-failed 2>/dev/null | tail -30
    fi
    exit 0
  fi

  echo "  ... $RUN_STATUS (${i}/${36})"
  sleep 5
done

echo "CI still running after 3 min — check manually: gh run list"
