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

IMPORTANT: You MUST respond with ONLY a valid JSON object.
No explanation before or after. No markdown code fences.
No \`\`\`json prefix. Just the raw JSON object starting with {`
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

Respond with ONLY this JSON object (no other text, no markdown fences):
{
  "overallScore": <number 1-10>,
  "verdict": "<one sentence overall assessment>",
  "scores": {
    "taskCompletion": <number 1-10>,
    "codeQuality": <number 1-10>,
    "security": <number 1-10>,
    "testing": <number 1-10>,
    "seniorSignals": <number 1-10>
  },
  "passed": ["<specific thing done well>"],
  "warnings": ["<something to improve>"],
  "blockers": ["<must fix before closing — empty array if none>"],
  "nextSteps": ["<specific actionable next step>"],
  "seniorTip": "<one senior engineering insight>"
}`
}

function extractJSON(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error(
      `No JSON object found in response.\nRaw response:\n${text}`
    )
  }
  return text.substring(start, end + 1)
}

export async function runReview(
  apiKey: string,
  config: MentorConfig,
  issueContent: string,
  diff: string,
  stagedFiles: string[],
  branch: string
): Promise<ReviewResult> {
  const systemPrompt = buildSystemPrompt(config)
  const userPrompt = buildUserPrompt(issueContent, diff, stagedFiles, branch)

  // Gemini Flash API
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,        // low temp for consistent structured output
      maxOutputTokens: 2048,
      responseMimeType: 'application/json'  // tell Gemini to return JSON
    }
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new Error(
      `Could not reach Gemini API. Check your internet connection.\n${(err as Error).message}`
    )
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Gemini API returned ${res.status} ${res.statusText}.\n${text.substring(0, 300)}`
    )
  }

  const data = await res.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>
      }
    }>
    error?: { message: string }
  }

  if (data.error) {
    throw new Error(`Gemini API error: ${data.error.message}`)
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  if (!text.trim()) {
    throw new Error('Gemini returned an empty response. Check your GEMINI_API_KEY.')
  }

  try {
    const jsonStr = extractJSON(text)
    return JSON.parse(jsonStr) as ReviewResult
  } catch (parseErr) {
    throw new Error(
      `Failed to parse Gemini response as JSON.\n` +
      `Parse error: ${(parseErr as Error).message}\n` +
      `Raw response:\n${text}`
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