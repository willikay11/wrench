#!/usr/bin/env node
import { writeFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import ora from 'ora'
import chalk from 'chalk'
import {
  loadConfig,
  loadEnv,
  extractIssueId,
  getCurrentBranch,
  getStagedFiles,
  getStagedDiff,
  findRoot,
} from './config.js'
import { fetchLinearIssue, formatIssueForReview } from './linear.js'
import { runReview, computeWeightedScore } from './reviewer.js'
import { printReview, shouldBlockCommit } from './formatter.js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const manualIssueId = (
    args.find((a) => a.startsWith('--issue='))?.split('=')[1] ||
    args.find((a) => !a.startsWith('--') && a !== 'review')
  )?.toUpperCase()

  const skipBlock       = args.includes('--no-block')
  const verbose         = args.includes('--verbose')
  const diffLastCommit  = args.includes('--diff-last-commit')
  const diffMain        = args.includes('--diff-main')
  const outputJsonPath  = args.find((a) => a.startsWith('--output-json='))?.split('=')[1]
  const ciMode          = process.env.MENTOR_CI_MODE === 'true'
  const ciIssueId       = process.env.MENTOR_ISSUE_ID
  const ciBranch        = process.env.MENTOR_BRANCH
  const ciDiffPath      = process.env.MENTOR_DIFF_PATH

  if (args.includes('--help') || args[0] === 'help') {
    printHelp()
    process.exit(0)
  }

  let config
  let env

  try {
    config = loadConfig()
    env = loadEnv()
  } catch (err) {
    console.error(chalk.red(`\n  Error: ${(err as Error).message}\n`))
    process.exit(1)
  }

  const branch = ciMode ? (ciBranch || 'unknown') : getCurrentBranch()
  const issueId =
    manualIssueId ||
    (ciMode ? ciIssueId?.toUpperCase() : null) ||
    extractIssueId(branch, config.branchPattern, config.project.linearTeam)

  if (!issueId) {
    console.log()
    console.log(chalk.yellow('  ⚠ Could not detect Linear issue ID.'))
    console.log(chalk.gray(`  Branch: ${branch}`))
    console.log(chalk.gray(`  Name your branch: feature/${config.project.linearTeam}-123-description`))
    console.log(chalk.gray(`  Or run: npm run review -- --issue=${config.project.linearTeam}-123`))
    console.log()
    process.exit(0)
  }

  // ── Determine diff source ─────────────────────────────────────────────────

  let stagedFiles: string[]
  let diff: string

  if (ciMode && ciDiffPath && existsSync(ciDiffPath)) {
    // CI mode — use diff file from environment
    diff = readFileSync(ciDiffPath, 'utf-8')
    stagedFiles = diff
      .split('\n')
      .filter((l) => l.startsWith('diff --git'))
      .map((l) => l.split(' b/')[1] || '')
      .filter(Boolean)

  } else if (diffLastCommit) {
    // Review the last commit (already committed work)
    console.log(chalk.gray('  Reviewing last commit (HEAD~1...HEAD)'))
    diff = getDiffFromGit('HEAD~1...HEAD')
    stagedFiles = extractFilesFromDiff(diff)

  } else if (diffMain) {
    // Review everything on this branch vs main
    console.log(chalk.gray('  Reviewing branch diff vs main'))
    diff = getDiffFromGit('main...HEAD')
    stagedFiles = extractFilesFromDiff(diff)

  } else {
    // Default — staged files (pre-commit mode)
    stagedFiles = getStagedFiles()
    diff = getStagedDiff()

    if (stagedFiles.length === 0) {
      // No staged files — fall back to last commit automatically
      console.log()
      console.log(chalk.yellow('  ⚠ No staged files — reviewing last commit instead.'))
      console.log()
      diff = getDiffFromGit('HEAD~1...HEAD')
      stagedFiles = extractFilesFromDiff(diff)

      if (stagedFiles.length === 0) {
        console.log(chalk.yellow('  ⚠ No changes found in last commit either.'))
        console.log(chalk.gray('  Stage files or make a commit first.'))
        console.log()
        process.exit(0)
      }
    }
  }

  const spinner = ora({
    text: `Fetching ${issueId} from Linear...`,
    color: 'cyan',
  }).start()

  try {
    const issue = await fetchLinearIssue(issueId, env.linearKey)
    const issueContent = formatIssueForReview(issue)

    spinner.text = 'Running senior engineer review (Gemini Flash)...'

    const result = await runReview(
      env.geminiKey, // field reused for gemini key
      config,
      issueContent,
      diff,
      stagedFiles,
      branch
    )

    result.overallScore = computeWeightedScore(result.scores, config.review.scoreWeights)

    spinner.stop()
    printReview(result, issueId, branch, config)

    if (outputJsonPath) {
      writeFileSync(outputJsonPath, JSON.stringify(result, null, 2))
    }

    if (!skipBlock && shouldBlockCommit(result, config)) {
      process.exit(1)
    }

    process.exit(0)
  } catch (err) {
    spinner.stop()
    console.error()
    console.error(chalk.red(`  Error: ${(err as Error).message}`))
    if (verbose) console.error((err as Error).stack)
    console.error()
    console.log(chalk.yellow(
      '  ⚠ Mentor review failed — commit allowed to proceed.\n' +
      '  Fix the error above and run: npm run review'
    ))
    console.log()
    process.exit(0)
  }
}

function getDiffFromGit(range: string): string {
  try {
    const diff = execSync(
      `git diff ${range} --unified=3 -- "*.ts" "*.tsx" "*.go" "*.sql" "*.css" "*.json"`,
      { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 10 }
    )
    return diff.length > 20000 ? truncateDiff(diff) : diff
  } catch {
    return ''
  }
}

function extractFilesFromDiff(diff: string): string[] {
  return diff
    .split('\n')
    .filter((l) => l.startsWith('diff --git'))
    .map((l) => l.split(' b/')[1] || '')
    .filter(Boolean)
}

function truncateDiff(diff: string): string {
  const files = diff.split('diff --git')
  let result = ''
  const truncated: string[] = []

  for (const file of files) {
    if (!file.trim()) continue
    const chunk = 'diff --git' + file
    if ((result + chunk).length <= 18000) {
      result += chunk
    } else {
      const name = file.match(/a\/(.*?) b\//)?.[1] || 'unknown'
      truncated.push(name)
    }
  }

  if (truncated.length > 0) {
    result += `\n\n[TRUNCATED: ${truncated.join(', ')}]\n`
  }
  return result
}

function printHelp(): void {
  console.log(`
${chalk.bold('Wrench Mentor Agent')}

Usage:
  npm run review                           Review staged files (pre-commit)
  npm run review:last                      Review last commit
  npm run review:branch                    Review all changes vs main
  npm run review -- --issue=WRE-135        Review specific Linear issue
  npm run review -- --no-block             Review without blocking commit
  npm run review -- --verbose              Show full error traces

Branch naming:
  feature/WRE-135-build-core-ui-components
  fix/WRE-201-fix-auth-redirect

Model: Google Gemini Flash (free tier — 1,500 requests/day)

Setup:
  1. Copy .mentor.env.example to .mentor.env
  2. Add GEMINI_API_KEY and LINEAR_API_KEY
  3. Get Gemini key free at: aistudio.google.com
  `)
}

main()