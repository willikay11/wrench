import chalk from 'chalk'
import type { ReviewResult } from './reviewer.js'
import type { MentorConfig } from './config.js'

function scoreColour(n: number): string {
  if (n >= 8) return chalk.green(n.toString())
  if (n >= 6) return chalk.yellow(n.toString())
  return chalk.red(n.toString())
}

function bar(score: number, width = 20): string {
  const filled = Math.round((score / 10) * width)
  const empty = width - filled
  const colour = score >= 8 ? chalk.green : score >= 6 ? chalk.yellow : chalk.red
  return colour('█'.repeat(filled)) + chalk.gray('░'.repeat(empty))
}

export function printReview(
  result: ReviewResult,
  issueId: string,
  branch: string,
  config: MentorConfig
): void {
  const { review } = config
  const blocked =
    review.blockOnBlockers && result.blockers.length > 0
  const belowThreshold = result.overallScore < review.minScoreToCommit

  console.log()
  console.log(chalk.bold('─'.repeat(60)))
  console.log(chalk.bold('  Wrench Mentor Agent'))
  console.log(chalk.gray(`  ${issueId} · ${branch}`))
  console.log(chalk.bold('─'.repeat(60)))
  console.log()

  // Overall score
  const scoreStr = scoreColour(result.overallScore)
  console.log(
    `  ${chalk.bold('Overall')}   ${bar(result.overallScore)}  ${scoreStr}/10`
  )
  console.log(`  ${chalk.gray(result.verdict)}`)
  console.log()

  // Score breakdown
  console.log(chalk.bold('  Scores'))
  const labels: [keyof typeof result.scores, string][] = [
    ['taskCompletion', 'Task completion'],
    ['codeQuality',    'Code quality   '],
    ['security',       'Security       '],
    ['testing',        'Testing        '],
    ['seniorSignals',  'Senior signals '],
  ]
  for (const [key, label] of labels) {
    const s = result.scores[key]
    console.log(`  ${chalk.gray(label)}  ${bar(s, 15)}  ${scoreColour(s)}/10`)
  }
  console.log()

  // What's working
  if (result.passed.length > 0) {
    console.log(chalk.bold.green('  ✓ What\'s working'))
    for (const item of result.passed) {
      console.log(`  ${chalk.green('✓')} ${item}`)
    }
    console.log()
  }

  // Warnings
  if (result.warnings.length > 0) {
    console.log(chalk.bold.yellow('  ⚠ Needs improvement'))
    for (const item of result.warnings) {
      console.log(`  ${chalk.yellow('⚠')} ${item}`)
    }
    console.log()
  }

  // Blockers
  if (result.blockers.length > 0) {
    console.log(chalk.bold.red('  ✗ Blockers — must fix before closing task'))
    for (const item of result.blockers) {
      console.log(`  ${chalk.red('✗')} ${item}`)
    }
    console.log()
  }

  // Next steps
  if (result.nextSteps.length > 0) {
    console.log(chalk.bold('  → Next steps'))
    for (const item of result.nextSteps) {
      console.log(`  ${chalk.cyan('→')} ${item}`)
    }
    console.log()
  }

  // Senior tip
  if (result.seniorTip) {
    console.log(chalk.bold.blue('  💡 Senior tip'))
    console.log(`  ${chalk.blue(result.seniorTip)}`)
    console.log()
  }

  console.log('─'.repeat(60))

  // Commit decision
  if (blocked) {
    console.log()
    console.log(
      chalk.bold.red(
        `  ✗ COMMIT BLOCKED — ${result.blockers.length} blocker(s) must be fixed first`
      )
    )
    console.log(
      chalk.gray(
        '  Fix the blockers above, stage your changes, and commit again.'
      )
    )
    console.log()
  } else if (belowThreshold) {
    console.log()
    console.log(
      chalk.bold.yellow(
        `  ⚠ COMMIT BLOCKED — score ${result.overallScore}/10 is below the minimum ${review.minScoreToCommit}/10`
      )
    )
    console.log(
      chalk.gray(
        '  Address the warnings above to bring the score up.'
      )
    )
    console.log()
  } else {
    console.log()
    console.log(
      chalk.bold.green(
        `  ✓ COMMIT APPROVED — score ${result.overallScore}/10 meets the minimum ${review.minScoreToCommit}/10`
      )
    )
    console.log()
  }
}

export function shouldBlockCommit(
  result: ReviewResult,
  config: MentorConfig
): boolean {
  if (config.review.blockOnBlockers && result.blockers.length > 0) return true
  if (result.overallScore < config.review.minScoreToCommit) return true
  return false
}
