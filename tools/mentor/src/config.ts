import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { config as loadDotenv } from 'dotenv'
import { execSync } from 'child_process'

export interface MentorConfig {
  project: {
    name: string
    repo: string
    linearTeam: string
    stack: string[]
  }
  review: {
    minScoreToCommit: number
    blockOnBlockers: boolean
    warnOnWarnings: boolean
    scoreWeights: {
      taskCompletion: number
      codeQuality: number
      security: number
      testing: number
      seniorSignals: number
    }
  }
  branchPattern: string
  standards: Record<string, string>
}

export interface Env {
  anthropicKey: string
  linearKey: string
  githubToken?: string
}

export function findRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 20; i++) {
    if (existsSync(resolve(dir, '.mentor.config.json'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

export function loadConfig(): MentorConfig {
  const root = findRoot()
  const configPath = resolve(root, '.mentor.config.json')

  console.log('DEBUG: Looking for config at', configPath)

  if (!existsSync(configPath)) {
    throw new Error(
      'No .mentor.config.json found. Run this from inside the wrench repo.'
    )
  }

  return JSON.parse(readFileSync(configPath, 'utf-8')) as MentorConfig
}

export function loadEnv(): Env {
  const root = findRoot()
  const envPath = resolve(root, '.mentor.env')
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const linearKey = process.env.LINEAR_API_KEY

  if (!anthropicKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not set.\nCopy .mentor.env.example to .mentor.env and add your key.'
    )
  }

  if (!linearKey) {
    throw new Error(
      'LINEAR_API_KEY not set.\nCopy .mentor.env.example to .mentor.env and add your key.'
    )
  }

  return {
    anthropicKey,
    linearKey,
    githubToken: process.env.GITHUB_TOKEN,
  }
}

export function extractIssueId(
  branchName: string,
  pattern: string,
  team: string
): string | null {
  try {
    const regex = new RegExp(pattern)
    const match = branchName.match(regex)
    if (match?.[1]) return match[1].toUpperCase()

    const fallback = new RegExp(`(${team}-\\d+)`, 'i')
    const fallbackMatch = branchName.match(fallback)
    if (fallbackMatch?.[1]) return fallbackMatch[1].toUpperCase()

    return null
  } catch {
    return null
  }
}

export function getCurrentBranch(): string {
  try {
    const root = findRoot()
    const headPath = resolve(root, '.git', 'HEAD')
    if (existsSync(headPath)) {
      const head = readFileSync(headPath, 'utf-8').trim()
      if (head.startsWith('ref: refs/heads/')) {
        return head.replace('ref: refs/heads/', '')
      }
    }
    return execSync('git branch --show-current', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

export function getStagedFiles(): string[] {
  try {
    const output = execSync('git diff --cached --name-only', {
      encoding: 'utf-8',
    }).trim()
    return output ? output.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

export function getStagedDiff(): string {
  try {
    const diff = execSync('git diff --cached --unified=3', {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 5,
    })
    // Limit to 8000 chars to stay within Claude context
    return diff.length > 8000 ? diff.substring(0, 8000) + '\n... (truncated)' : diff
  } catch {
    return ''
  }
}
