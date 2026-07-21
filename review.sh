#!/usr/bin/env sh
# Wrench Mentor — standalone review script
# Run this to review already-committed work or work in progress
#
# Usage:
#   ./review.sh                          — review current branch task
#   ./review.sh WRE-135                  — review specific Linear issue
#   ./review.sh WRE-135 HEAD~1           — review last commit diff
#   ./review.sh WRE-135 main             — review diff against main branch

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "Error: not inside a git repository"
  exit 1
fi

MENTOR_DIR="$REPO_ROOT/tools/mentor"
ISSUE_ID="${1:-}"
COMPARE_REF="${2:-}"

# Check mentor is installed
if [ ! -d "$MENTOR_DIR/node_modules" ]; then
  echo "Installing mentor dependencies..."
  cd "$MENTOR_DIR" && npm install --silent
fi

# Check API keys
if [ ! -f "$REPO_ROOT/.mentor.env" ]; then
  echo "Error: .mentor.env not found"
  echo "Copy .mentor.env.example to .mentor.env and add your keys"
  exit 1
fi

# If a compare ref is provided, generate a diff against it
# and pass it via a temp file
if [ -n "$COMPARE_REF" ]; then
  DIFF_FILE=$(mktemp /tmp/mentor-diff-XXXXXX.txt)
  git diff "$COMPARE_REF"...HEAD \
    -- '*.ts' '*.tsx' '*.go' '*.sql' '*.css' '*.json' \
    > "$DIFF_FILE" 2>/dev/null

  DIFF_SIZE=$(wc -c < "$DIFF_FILE")
  echo "Reviewing diff against $COMPARE_REF ($DIFF_SIZE bytes)"

  MENTOR_DIFF_PATH="$DIFF_FILE" \
  MENTOR_CI_MODE="true" \
  MENTOR_BRANCH="$(git branch --show-current)" \
    cd "$MENTOR_DIR" && npx tsx src/index.ts review \
      ${ISSUE_ID:+--issue="$ISSUE_ID"} \
      --no-block

  rm -f "$DIFF_FILE"
else
  # Review staged files (pre-commit style) or last commit if nothing staged
  STAGED=$(git diff --cached --name-only 2>/dev/null)

  if [ -z "$STAGED" ]; then
    echo "No staged files found — reviewing last commit instead"
    echo ""

    # Get last commit diff
    DIFF_FILE=$(mktemp /tmp/mentor-diff-XXXXXX.txt)
    git diff HEAD~1...HEAD \
      -- '*.ts' '*.tsx' '*.go' '*.sql' '*.css' '*.json' \
      > "$DIFF_FILE" 2>/dev/null

    DIFF_SIZE=$(wc -c < "$DIFF_FILE")
    echo "Last commit diff: $DIFF_SIZE bytes"

    MENTOR_DIFF_PATH="$DIFF_FILE" \
    MENTOR_CI_MODE="true" \
    MENTOR_BRANCH="$(git branch --show-current)" \
      cd "$MENTOR_DIR" && npx tsx src/index.ts review \
        ${ISSUE_ID:+--issue="$ISSUE_ID"} \
        --no-block

    rm -f "$DIFF_FILE"
  else
    # Use staged files (same as pre-commit)
    cd "$MENTOR_DIR" && npx tsx src/index.ts review \
      ${ISSUE_ID:+--issue="$ISSUE_ID"} \
      --no-block
  fi
fi