# Emergency push (прод лежит, фикс нужен в обход CI)

> Это аварийная процедура. В обычной работе она **не нужна** — все изменения идут через PR-flow (см. `AGENTS.md` → «Workflow: PR flow с CI-gate»). Снимать защиту можно **только** когда прод реально лежит и пользователь это подтвердил (правило 5 для агентов).

`enforce_admins: true` — branch protection работает **и для админа**. `git push origin main` отказывается даже у владельца репо. Это намеренно: «можно обойти» = «когда-нибудь обойдётся случайно».

Если прод реально лежит и фикс должен уйти срочно:

```bash
# 1. Снять защиту (~5 секунд)
gh api repos/bon2362/book-club/branches/main/protection -X DELETE

# 2. Сделать прямой push с фиксом
git push origin main

# 3. ВЕРНУТЬ защиту обратно — иначе следующий случайный коммит уйдёт без CI
gh api repos/bon2362/book-club/branches/main/protection -X PUT --input - <<'JSON'
{
  "required_status_checks": {"strict": false, "checks": [{"context": "ci"}]},
  "enforce_admins": true,
  "required_pull_request_reviews": {"required_approving_review_count": 0, "dismiss_stale_reviews": false, "require_code_owner_reviews": false},
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false,
  "required_linear_history": false
}
JSON
```

**Шаг 3 ВАЖЕН.** Поставь напоминание сразу после шага 1 — иначе защита останется снятой и следующий случайный коммит уйдёт в прод без CI.
