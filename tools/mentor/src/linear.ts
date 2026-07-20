interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  state: { name: string }
  assignee: { name: string } | null
  labels: { nodes: { name: string }[] }
  url: string
}

export async function fetchLinearIssue(
  issueId: string,
  apiKey: string
): Promise<LinearIssue> {
  const query = `
    query GetIssue($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        url
        state { name }
        assignee { name }
        labels { nodes { name } }
      }
    }
  `

  let res: Response
  try {
    res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        'apollo-require-preflight': 'true',
      },
      body: JSON.stringify({ query, variables: { id: issueId } }),
    })
  } catch (err) {
    throw new Error(
      `Could not reach Linear API. Check your internet connection.\n${(err as Error).message}`
    )
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Linear API returned ${res.status} ${res.statusText}.\n` +
      `Response: ${body.substring(0, 300)}`
    )
  }

  const rawText = await res.text()

  if (!rawText || rawText.trim().length === 0) {
    throw new Error('Linear API returned an empty response.')
  }

  let data: {
    data?: { issue?: LinearIssue }
    errors?: { message: string }[]
  }

  try {
    data = JSON.parse(rawText)
  } catch {
    throw new Error(
      `Linear API returned invalid JSON.\nRaw: ${rawText.substring(0, 300)}`
    )
  }

  if (data.errors?.length) {
    throw new Error(
      `Linear GraphQL error: ${data.errors.map((e) => e.message).join(', ')}`
    )
  }

  if (!data.data?.issue) {
    throw new Error(
      `Issue ${issueId} not found in Linear.\n` +
      `Check:\n` +
      `  1. The issue ID is correct (e.g. WRE-135)\n` +
      `  2. Your LINEAR_API_KEY has access to this team\n` +
      `  3. The issue exists in Linear`
    )
  }

  return data.data.issue
}

export function formatIssueForReview(issue: LinearIssue): string {
  const labels = issue.labels.nodes.map((l) => l.name).join(', ')

  return [
    `TASK: ${issue.identifier} — ${issue.title}`,
    `Status: ${issue.state.name}`,
    labels ? `Labels: ${labels}` : '',
    issue.assignee ? `Assignee: ${issue.assignee.name}` : '',
    `URL: ${issue.url}`,
    '',
    'DESCRIPTION:',
    issue.description || 'No description provided.',
  ]
    .filter(Boolean)
    .join('\n')
}