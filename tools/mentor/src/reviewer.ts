import Anthropic from '@anthropic-ai/sdk'
import type { MentorConfig } from './config.js'

export interface ReviewScores {
  taskCompletion: number
  codeQuality: number
  security: number
  testing: number
  seniorSignals: number
}

export interface ReviewResult {
  overallScore: number
  verdict: string
  scores: ReviewScores
  passed: string[]
  warnings: string[]
  blockers: string[]
  nextSteps: string[]
  seniorTip: string
}

function buildSystemPrompt(config: MentorConfig): string {
  const standards = Object.entries(config.standards)
    .map(([key, value]) => `  - ${key}: ${value}`)
    .join('\n')

  const stack = config.project.stack.join(', ')

  return `You are a senior engineer at ${config.project.name} conducting a code review.

Stack: ${stack}

Project standards that MUST be enforced:
${standards}

Your role:
- Review code as a senior engineer would review a PR from a mid-level engineer
- Be specific and constructive — reference actual code, file names, or task details
- Reward senior engineering signals: error handling, security awareness, test coverage, observability
- Flag anything that violates the project standards above as a BLOCKER
- A score below ${config.review.minScoreToCommit} means the work is not ready to commit
- Be direct but not harsh — the goal is growth, not gatekeeping

Score weights:
- Task completion (${config.review.scoreWeights.taskCompletion * 100}%): Did they meet the definition of done?
- Code quality (${config.review.scoreWeights.codeQuality * 100}%): Is the code clean, readable, well-structured?
- Security (${config.review.scoreWeights.security * 100}%): Are ownership checks, input validation, auth correct?
- Testing (${config.review.scoreWeights.testing * 100}%): Are there tests? Do they cover edge cases?
- Senior signals (${config.review.scoreWeights.seniorSignals * 100}%): Error handling, observability, documentation

Respond ONLY with valid JSON. No markdown fences, no preamble, no explanation outside the JSON.`
}

function buildUserPrompt(
  issueContent: string,
  diff: string,
  stagedFiles: string[],
  branch: string
): string {
  const filesSection = stagedFiles.length
    ? `STAGED FILES (${stagedFiles.length}):\n${stagedFiles.join('\n')}`
    : 'No staged files detected.'

  const diffSection = diff
    ? `CODE DIFF:\n${diff}`
    : 'No diff available — review based on task description and file list only.'

  return `Review this commit on branch: ${branch}

${issueContent}

${filesSection}

${diffSection}

Return this exact JSON structure:
{
  "overallScore": <1-10>,
  "verdict": "<one sentence — overall assessment of this commit>",
  "scores": {
    "taskCompletion": <1-10>,
    "codeQuality": <1-10>,
    "security": <1-10>,
    "testing": <1-10>,
    "seniorSignals": <1-10>
  },
  "passed": [
    "<specific thing done well — reference file or code if possible>",
    "<another>"
  ],
  "warnings": [
    "<something to improve — be specific>",
    "<another>"
  ],
  "blockers": [
    "<must fix before this can be considered done — reference project standard if violated>"
  ],
  "nextSteps": [
    "<specific actionable thing to do next>",
    "<another>"
  ],
  "seniorTip": "<one senior engineering insight specific to what was just built>"
}`
}

export async function runReview(
  apiKey: string,
  config: MentorConfig,
  issueContent: string,
  diff: string,
  stagedFiles: string[],
  branch: string
): Promise<ReviewResult> {
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: buildSystemPrompt(config),
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(issueContent, diff, stagedFiles, branch),
      },
    ],
  })

  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('')

  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean) as ReviewResult
  } catch {
    throw new Error(
      `Claude returned unexpected format.\nRaw response:\n${text}`
    )
  }
}

export function computeWeightedScore(
  scores: ReviewScores,
  weights: MentorConfig['review']['scoreWeights']
): number {
  const weighted =
    scores.taskCompletion * weights.taskCompletion +
    scores.codeQuality * weights.codeQuality +
    scores.security * weights.security +
    scores.testing * weights.testing +
    scores.seniorSignals * weights.seniorSignals

  return Math.round(weighted * 10) / 10
}
