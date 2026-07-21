#!/usr/bin/env node
import { writeFileSync } from 'fs'
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
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0] === 'review' ? 'review' : 'review'
  const manualIssueId = (
    args.find((a) => a.startsWith('--issue='))?.split('=')[1] ||
    (args.find((a) => !a.startsWith('--') && a !== 'review'))
  )?.toUpperCase()

  const skipBlock = args.includes('--no-block')
  const verbose = args.includes('--verbose')
  const outputJsonPath = args.find((a) => a.startsWith('--output-json='))?.split('=')[1]
  const ciMode = process.env.MENTOR_CI_MODE === 'true'
  const ciIssueId = process.env.MENTOR_ISSUE_ID
  const ciBranch = process.env.MENTOR_BRANCH
  const ciDiffPath = process.env.MENTOR_DIFF_PATH

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
    console.log(
      chalk.gray(
        `  Name your branch: feature/${config.project.linearTeam}-123-description`
      )
    )
    console.log(
      chalk.gray(
        `  Or run: npm run review -- --issue=${config.project.linearTeam}-123`
      )
    )
    console.log()
    process.exit(0)
  }

  // Get diff — either from CI env (PR diff) or from staged changes
  let stagedFiles: string[]
  let diff: string

  if (ciMode && ciDiffPath && existsSync(ciDiffPath)) {
    diff = readFileSync(ciDiffPath, 'utf-8')
    stagedFiles = diff
      .split('\n')
      .filter((l) => l.startsWith('diff --git'))
      .map((l) => l.split(' b/')[1] || '')
      .filter(Boolean)
  } else {
    stagedFiles = getStagedFiles()
    diff = getStagedDiff()
  }

  if (!ciMode && stagedFiles.length === 0) {
    console.log()
    console.log(chalk.yellow('  ⚠ No staged files found.'))
    console.log(
      chalk.gray('  Stage your changes with git add before committing.')
    )
    console.log()
    process.exit(0)
  }

  const spinner = ora({
    text: `Fetching ${issueId} from Linear...`,
    color: 'cyan',
  }).start()

  try {
    const issue = await fetchLinearIssue(issueId, env.linearKey)
    const issueContent = formatIssueForReview(issue)

    spinner.text = 'Running senior engineer review...'

    const result = await runReview(
      env.anthropicKey,
      config,
      issueContent,
      diff,
      stagedFiles,
      branch
    )

    result.overallScore = computeWeightedScore(
      result.scores,
      config.review.scoreWeights
    )

    spinner.stop()

    printReview(result, issueId, branch, config)

    // Write JSON output for GitHub Action to consume
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
    console.log(
      chalk.yellow(
        '  ⚠ Mentor review failed — commit allowed to proceed.\n' +
          '  Fix the error above and run: npm run review'
      )
    )
    console.log()
    process.exit(0)
  }
}

function printHelp(): void {
  console.log(`
${chalk.bold('Wrench Mentor Agent')}

Usage:
  npm run review                         Review current branch task
  npm run review -- --issue=WRE-135      Review specific Linear issue
  npm run review -- --no-block           Review without blocking commit
  npm run review -- --verbose            Show full error traces

Branch naming:
  feature/WRE-135-build-core-ui-components
  fix/WRE-201-fix-auth-redirect

Setup:
  1. Copy .mentor.env.example to .mentor.env
  2. Add ANTHROPIC_API_KEY and LINEAR_API_KEY
  3. cd tools/mentor && npm install
  `)
}

main()
