# Wrench Mentor Agent

A senior engineer mentor that reviews your code against Linear task descriptions before every commit.

## What it does

1. Reads the Linear issue ID from your branch name
2. Fetches the task description + definition of done from Linear
3. Reads your staged diff (`git diff --cached`)
4. Sends both to Claude claude-sonnet-4-6 for a structured review
5. Prints scored feedback in the terminal
6. Blocks the commit if blockers are found or score is below minimum

## Setup (one time per machine)

**1. Install dependencies**
```bash
cd tools/mentor
npm install
```

**2. Set up API keys**
```bash
# From repo root
cp .mentor.env.example .mentor.env
```

Edit `.mentor.env`:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
LINEAR_API_KEY=lin_api_your-key-here
```

**3. Install husky hooks**
```bash
# From repo root
npx husky install
```

This activates the pre-commit hook automatically.

## Branch naming convention

The mentor detects which Linear task you are working on from your branch name.

```
feature/WRE-135-build-core-ui-components  ← WRE-135 is detected
fix/WRE-201-fix-auth-redirect             ← WRE-201 is detected
chore/WRE-089-update-readme               ← WRE-089 is detected
```

If the branch name does not contain an issue ID, the review is skipped and the commit proceeds.

## Manual usage

```bash
# Review current branch task
npm run review

# Review a specific Linear issue
npm run review -- --issue=WRE-135

# Review without blocking the commit
npm run review -- --no-block

# See detailed errors
npm run review -- --verbose
```

## How commits are blocked

A commit is blocked when either:
- There are blockers in the review (must-fix issues)
- The overall score is below `minScoreToCommit` (default: 6/10)

To bypass in an emergency:
```bash
git commit --no-verify -m "emergency fix"
```

Use `--no-verify` sparingly. It bypasses all hooks including linting.

## Scores

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| Task completion | 30% | Does the code meet the Linear task's definition of done? |
| Code quality | 25% | Clean, readable, well-structured Go/TypeScript? |
| Security | 20% | Ownership checks, input validation, auth correct? |
| Testing | 15% | Integration tests, IDOR checks, edge cases? |
| Senior signals | 10% | Error handling, observability, documentation? |

## GitHub Action

On every PR against `main`, the mentor posts a review comment automatically.

Required GitHub secrets (add in repo Settings → Secrets):
- `ANTHROPIC_API_KEY`
- `LINEAR_API_KEY`

## Configuration

Edit `.mentor.config.json` at the repo root to adjust:
- `review.minScoreToCommit` — minimum score to allow a commit (default: 6)
- `review.blockOnBlockers` — block on any blocker (default: true)
- `standards` — project-specific rules Claude enforces in every review
