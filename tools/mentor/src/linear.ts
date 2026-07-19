interface LinearIssue {
  id: string
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
        title
        description
        url
        state { name }
        assignee { name }
        labels { nodes { name } }
      }
    }
  `

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { id: issueId } }),
  })

  if (!res.ok) {
    throw new Error(`Linear API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as {
    data?: { issue?: LinearIssue }
    errors?: { message: string }[]
  }

  if (data.errors?.length) {
    throw new Error(`Linear GraphQL error: ${data.errors[0].message}`)
  }

  if (!data.data?.issue) {
    throw new Error(
      `Issue ${issueId} not found in Linear.\n` +
      `Check the issue ID and make sure your LINEAR_API_KEY has access.`
    )
  }

  return data.data.issue
}

export function formatIssueForReview(issue: LinearIssue): string {
  const labels = issue.labels.nodes.map((l) => l.name).join(', ')

  return [
    `TASK: ${issue.id} — ${issue.title}`,
    `Status: ${issue.state.name}`,
    labels ? `Labels: ${labels}` : '',
    issue.assignee ? `Assignee: ${issue.assignee.name}` : '',
    `URL: ${issue.url}`,
    '',
    'DESCRIPTION:',
    issue.description || 'No description provided.',
  ]
    .filter((line) => line !== null && line !== undefined)
    .join('\n')
}
