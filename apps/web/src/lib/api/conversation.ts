export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ExtractedContext {
  car: string | null
  goal: string | null
  use_case: string | null
}

export interface ConversationResponse {
  reply: string
  state: 'gathering' | 'confirming' | 'ready'
  extracted: ExtractedContext
  session_id: string
}

export async function sendMessage(
  message: string,
  history: ConversationMessage[],
  sessionId?: string
): Promise<ConversationResponse> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

  const res = await fetch(`${API_URL}/v1/conversation/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history,
      session_id: sessionId,
    }),
  })

  if (!res.ok) {
    throw new Error('Conversation failed')
  }

  return res.json()
}
