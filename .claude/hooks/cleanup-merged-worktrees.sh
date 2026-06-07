#!/usr/bin/env bash
#
# cleanup-merged-worktrees.sh
#
# Removes orphaned sibling worktrees created by the documented PR-flow command
#   git worktree add ../book-club-<task> -b <branch> origin/main
# once their PR has been merged (branch pushed with an upstream that is now gone
# on origin) and the working tree is clean.
#
# SAFETY (intentionally conservative — it only ever removes throwaway copies):
#   - ONLY touches sibling dirs matching "<repo-parent>/book-club-*".
#     Harness worktrees under .claude/worktrees/ and Codex/superpowers worktrees
#     are managed by their own tools and are left completely alone.
#   - NEVER touches the main checkout or the current worktree.
#   - SKIPS any worktree with uncommitted changes (tracked or untracked).
#   - SKIPS branches that were never pushed (no upstream) — i.e. work in progress.
#     A worktree is only removed when its branch HAD an upstream that is now
#     absent on origin, which is exactly what `gh pr merge --delete-branch` leaves
#     behind.
#
# Used both as a Claude Code SessionStart hook and runnable by hand:
#   bash .claude/hooks/cleanup-merged-worktrees.sh
#
set -uo pipefail

# Resolve repo root (works from a hook or a manual run).
root="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$root" ]; then
  root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
fi
git -C "$root" rev-parse --git-dir >/dev/null 2>&1 || exit 0

main_root="$(git -C "$root" worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
parent_dir="$(dirname "$main_root")"
sibling_glob="${parent_dir}/book-club-"
current="$(pwd -P)"

removed=0

# Parse `git worktree list --porcelain` into "path<TAB>branch" rows.
while IFS=$'\t' read -r path ref; do
  [ -n "$path" ] || continue
  branch="${ref#refs/heads/}"

  # Only sibling worktrees created by the manual PR-flow convention.
  case "$path" in
    "${sibling_glob}"*) : ;;
    *) continue ;;
  esac

  # Never the main checkout or the worktree we're running inside.
  [ "$path" = "$main_root" ] && continue
  case "$current" in "$path"|"$path"/*) continue ;; esac

  # Must be detached-free with a real branch and a clean tree.
  [ -n "$branch" ] || continue
  [ -d "$path" ] || continue
  [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ] && continue

  # Branch must have been pushed under its OWN name (git push -u origin <branch>
  # sets merge=refs/heads/<branch>). A branch merely created from origin/main
  # tracks refs/heads/main, which we must NOT treat as "was pushed".
  upstream_ref="$(git -C "$root" config --get "branch.${branch}.merge" 2>/dev/null)"
  [ "$upstream_ref" = "refs/heads/${branch}" ] || continue

  # ...and that upstream is now gone on origin (deleted by --delete-branch).
  if git -C "$root" ls-remote --heads origin "$branch" 2>/dev/null | grep -q .; then
    continue
  fi

  # Safe to remove: merged PR + clean throwaway copy.
  git -C "$root" worktree remove --force "$path" 2>/dev/null || rm -rf "$path"
  git -C "$root" worktree prune 2>/dev/null || true
  git -C "$root" branch -D "$branch" 2>/dev/null || true
  echo "[worktree-cleanup] removed $path ($branch)"
  removed=$((removed + 1))
done < <(git -C "$root" worktree list --porcelain | awk '
  /^worktree /{wt=$2}
  /^branch /{print wt"\t"$2}
')

[ "$removed" -gt 0 ] && echo "[worktree-cleanup] cleaned $removed orphaned worktree(s)"
exit 0
