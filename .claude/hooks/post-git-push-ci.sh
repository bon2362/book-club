#!/bin/bash
# PostToolUse hook: after git push — wait for CI and print result

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)

if ! echo "$COMMAND" | grep -q "git push"; then
  exit 0
fi

# Get the SHA we just pushed
PUSHED_SHA=$(git -C /workspace rev-parse HEAD 2>/dev/null)

# Wait for GitHub to register the run
sleep 5

echo "=== CI: waiting for GitHub Actions (SHA: ${PUSHED_SHA:0:7}) ==="

# Wait up to 5 minutes (60 × 5s)
for i in $(seq 1 60); do
  STATUS=$(gh run list --limit 5 --json status,conclusion,name,url,headSha 2>/dev/null)

  # Find the run matching our pushed SHA
  RUN=$(echo "$STATUS" | python3 -c "
import sys, json
runs = json.load(sys.stdin)
sha = '${PUSHED_SHA}'
for r in runs:
    if r.get('headSha','').startswith(sha[:7]) or sha.startswith(r.get('headSha','')[:7]):
        print(r['status'], r.get('conclusion',''), r['name'], r['url'])
        break
" 2>/dev/null)

  # Fallback to most recent run if SHA not matched yet
  if [ -z "$RUN" ]; then
    RUN=$(echo "$STATUS" | python3 -c "
import sys, json
runs = json.load(sys.stdin)
if runs:
    r = runs[0]
    print(r['status'], r.get('conclusion',''), r['name'], r['url'])
" 2>/dev/null)
  fi

  RUN_STATUS=$(echo "$RUN" | awk '{print $1}')
  RUN_CONCLUSION=$(echo "$RUN" | awk '{print $2}')
  RUN_URL=$(echo "$RUN" | awk '{print $4}')

  if [ "$RUN_STATUS" = "completed" ]; then
    if [ "$RUN_CONCLUSION" = "success" ]; then
      echo "✓ CI passed"
    else
      echo ""
      echo "✗ CI FAILED — исправь ошибки и запушь снова"
      echo "  Run: $RUN_URL"
      echo ""
      gh run view --log-failed 2>/dev/null | grep -E "error TS|Error:" | head -20
    fi
    exit 0
  fi

  echo "  ... ${RUN_STATUS} (${i}/60, ~$((i*5))s)"
  sleep 5
done

echo "CI still running after 5 min — check: gh run list"
