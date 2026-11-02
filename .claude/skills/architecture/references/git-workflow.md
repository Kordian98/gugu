# Local AI-first git workflow

How agents branch, commit, get reviewed and merge while GuGu has **no git remote**. `main` is local and is the integration branch. Policy (product owner, 2026-11-02): agents may merge to `main` after green gates + required reviewer agents; no human approval is needed. Spec: `docs/tasks/01-architecture.md` §3.9.

## Roles
- **Orchestrator:** creates and removes worktrees, merges to `main`, updates the roadmap. It is the only actor that runs git in the main checkout.
- **Domain agent:** works and commits only inside its assigned worktree, only in its owned paths.
- **Reviewer agents:** read-only; they review the worktree diff (`git diff main...HEAD`).

## 1. Start a task
The agent sets its tracker task to `doing` (roadmap-tracker skill → Start a task). If `ArtifactData` is unavailable, it appends to `docs/tasks/tracker-inbox.jsonl`.

```bash
BR=booking-engine/M6.3-holds
git worktree add ../gugu-wt/$BR -b $BR main
cd ../gugu-wt/$BR && pnpm install --frozen-lockfile
```
- One task = one branch = one worktree. Parallel agents never share a working tree. Reason: separate index files mean no `index.lock` contention and no half-written files from another agent.
- A single agent doing sequential work may use a plain branch in the main checkout, but only when no other agent is active.

## 2. Work and commit (agent, inside its worktree)
- Edit only paths in your assignment (from `ownership.md`). If you need a change elsewhere, stop and report it to the orchestrator.
- Do not change `pnpm-lock.yaml` unless you are `architecture` or the task is a dependency task.
- Commit small, logical units:
```
<type>(<scope>): <imperative summary, ≤ 72 chars>

Why: <one or two lines, cite spec section>
Refs: <milestone id, e.g. M6.3>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
  - `type` ∈ feat, fix, refactor, test, docs, chore, build, ci, perf
  - `scope` = topic slug or module (`booking-engine`, `contracts`, `i18n`…)
  - The `Co-Authored-By` trailer is required on agent-authored commits. Use the exact trailer the session provides.
- Never `--no-verify`, never `git commit --amend` on commits already merged, never `git push --force`.

## 3. Merge gate (inside the worktree)
1. `git rebase main` (worktrees share refs, so `main` is already current; resolve conflicts only in your paths; otherwise report).
2. `pnpm verify`: the single deterministic gate (lint, typecheck, unit + integration, i18n coverage, boundaries, generated-client freshness).
3. `pnpm agents:check`
4. Reviewers (orchestrator runs them on `git diff main...HEAD`):

| Diff touches | Required reviewer |
|---|---|
| any code | `architecture` (review mode) |
| API routes, Prisma queries, auth/session, uploads, webhooks, agent tools, env/config, logging | `security-reviewer` |
| screens, components, design-system, styles, 3D hero | `design-reviewer` |
| UI strings, translation keys, notification templates, formatting | `localization` (review mode) |
| production logic without tests, or test changes | `test-engineer` (review mode) |
| `packages/agent-tools`, `*/agent-tools.ts` | `ai-agent` (review mode) |

Blocking findings go back to the owner agent; repeat the gate after fixes.

## 4. Merge (orchestrator, main checkout, strictly one at a time)
```bash
git checkout main
git merge --no-ff $BR -m "merge(booking-engine): M6.3 holds" \
  -m "Reviewed-by-agents: architecture, security-reviewer, test-engineer" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
pnpm verify || git revert -m 1 --no-edit HEAD   # on red: revert, send task back
git worktree remove ../gugu-wt/$BR && git branch -d $BR
```
If `pnpm merge-to-main` exists (topic 13), use it; it wraps the steps above.

**Tracker step (right after the merge):** set the task to `done` in the live tracker [GuGu Roadmap](https://claude.ai/artifact/CkweFTJGUNC1M9hoCAmwn3), with a note naming the merge commit; add a `log` entry; sync `docs/tasks/tracker-inbox.jsonl` into the tracker and truncate it. Procedure: `.claude/skills/roadmap-tracker/SKILL.md`. Agents set their own task to `doing`/`blocked` while they work, but never to `done`.
After merging a change to a hot file, the other open worktrees rebase before their own gate.

## 5. Conflict and lock avoidance
- Write paths of concurrent tasks never overlap (orchestrator's job).
- Hot files (`ownership.md` → Hot files) are held by one task at a time; merge that task first.
- `.git/index.lock` present → another git process is running. Wait 2 s, retry up to 3 times, then report. Remove a stale lock only when `pgrep -fl "git "` shows no git process, and log that you did.
- `git worktree list` / `git worktree prune` belong to the orchestrator.
- Never run `git gc`, `git stash` on behalf of other agents, or checkout in someone else's worktree.

## 6. Once a remote exists
- Protect `main` on the remote; local merges to `main` stop.
- Agents push their branch (`git push -u origin $BR`) and open a PR whose description ends with the session's PR attribution line.
- CI (topic 13) runs `pnpm verify` + `pnpm agents:check`; reviewer agents post findings as PR review comments.
- Merge via PR after green CI + reviewers (plus human approval if the policy changes). Prefer merge commits to keep `Reviewed-by-agents` lines.
- Local: `git pull --ff-only` on `main`; worktrees remain the way to run parallel agents.
- Secret scanning (gitleaks) runs in CI too; local hooks stay as the first line.
