"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { createBuild } from "@/lib/api/builds"
import {
  type ConversationMessage,
  type ExtractedContext,
  sendMessage,
} from "@/lib/api/conversation"
import { cn } from "@/lib/utils"

type PageState = "idle" | "chatting" | "creating"

export default function HomePage() {
  const router = useRouter()
  const [pageState, setPageState] = React.useState<PageState>("idle")
  const [input, setInput] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [sessionId, setSessionId] = React.useState<string>()

  // Conversation state
  const [messages, setMessages] = React.useState<ConversationMessage[]>([])
  const [conversationState, setConversationState] = React.useState<
    "gathering" | "confirming" | "ready"
  >("gathering")
  const [extracted, setExtracted] = React.useState<ExtractedContext>({
    car: null,
    goal: null,
    use_case: null,
  })

  // Creating state
  const [completedSteps, setCompletedSteps] = React.useState(0)
  const [creatingStartTime, setCreatingStartTime] = React.useState<number | null>(null)

  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  const scrollToBottom = React.useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  React.useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Animate creating steps
  React.useEffect(() => {
    if (pageState !== "creating") return
    const steps = 4
    if (completedSteps >= steps) return

    const timer = setTimeout(() => {
      setCompletedSteps((prev) => prev + 1)
    }, 800)

    return () => clearTimeout(timer)
  }, [pageState, completedSteps])

  const handleSendMessage = React.useCallback(
    async (text: string) => {
      if (!text.trim()) return

      // Add user message
      const userMessage: ConversationMessage = { role: "user", content: text }
      const newMessages = [...messages, userMessage]
      setMessages(newMessages)
      setInput("")
      setIsLoading(true)

      try {
        // Sign in anonymously on first message
        if (!sessionId) {
          const supabase = createClient()
          const { error } = await supabase.auth.signInAnonymously()
          if (error) throw error
        }

        // Transition to chatting state on first message
        if (pageState === "idle") {
          setPageState("chatting")
        }

        // Call conversation endpoint
        const response = await sendMessage(
          text,
          messages,
          sessionId,
        )

        // Update session ID
        if (!sessionId) {
          setSessionId(response.session_id)
        }

        // Add AI message
        const assistantMessage: ConversationMessage = {
          role: "assistant",
          content: response.reply,
        }
        setMessages((prev) => [...prev, assistantMessage])

        // Update conversation state
        setConversationState(response.state)
        setExtracted(response.extracted)

        // If ready, transition to creating
        if (response.state === "ready") {
          setPageState("creating")
          setCreatingStartTime(Date.now())
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Conversation failed"
        )
        // Remove the user message on error
        setMessages((prev) => prev.slice(0, -1))
      } finally {
        setIsLoading(false)
      }
    },
    [messages, sessionId],
  )

  const handleConfirm = React.useCallback(async () => {
    setPageState("creating")
    setCreatingStartTime(Date.now())
    setCompletedSteps(0)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error("Not authenticated")

      const created = await createBuild(
        {
          title: `${extracted.car} — ${extracted.goal}`,
          car: extracted.car || undefined,
          goals: extracted.goal ? [extracted.goal] : [],
          modification_goal: extracted.goal && extracted.use_case
            ? `${extracted.goal} — ${extracted.use_case}`
            : undefined,
        },
        session.access_token,
      )

      const elapsed = Date.now() - (creatingStartTime || 0)
      const remaining = Math.max(1500 - elapsed, 0)

      setTimeout(() => {
        router.push(`/builds/${created.id}`)
      }, remaining)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create build",
      )
      setPageState("chatting")
    }
  }, [extracted, router, creatingStartTime])

  const handleChipClick = (chipText: string) => {
    handleSendMessage(chipText)
  }

  // Example chips for idle state
  const idleChips = [
    "K24 swap into an E30",
    "Change rims on my WRX",
    "Coilover upgrade on a Civic",
    "Budget track build",
  ]

  // Chips based on conversation state
  let conversationChips: string[] = []
  if (conversationState === "confirming") {
    conversationChips = ["Yes, generate my parts list →"]
  }

  if (pageState === "idle") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {/* Navbar */}
        <header className="border-b border-border px-4 py-4">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <Logo variant="icon" size="md" />
            <div className="flex gap-2">
              <Link href="/auth/login">
                <Button variant="outline" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link href="/auth/signup">
                <Button size="sm" className="bg-brand text-white hover:bg-brand/90">
                  Get started
                </Button>
              </Link>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex flex-1 items-center justify-center px-4 py-16">
          <div className="w-full max-w-[520px]">
            {/* Header */}
            <div className="mb-8 text-center">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                AI-powered car builds
              </p>
              <h1 className="mb-4 text-4xl font-bold tracking-tight">
                What are you building?
              </h1>
              <p className="text-base text-muted-foreground">
                Describe your car and what you want to do — Wrench generates your
                complete parts list in seconds.
              </p>
            </div>

            {/* Input card */}
            <div className="mb-8 rounded-lg border border-border bg-card p-4">
              <div className="mb-4 flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isLoading) {
                      handleSendMessage(input)
                    }
                  }}
                  placeholder="e.g. K24 swap into my E30, or change rims on my WRX..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button
                  onClick={() => handleSendMessage(input)}
                  disabled={isLoading || !input.trim()}
                  size="icon-sm"
                  className="bg-[#D97706] hover:bg-[#B45309] text-white"
                >
                  →
                </Button>
              </div>

              {/* Example chips */}
              <div className="flex flex-wrap gap-2">
                {idleChips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleChipClick(chip)}
                    disabled={isLoading}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs transition-colors hover:border-[#D97706] hover:text-[#D97706] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Trust signals */}
            <div className="text-center text-xs text-muted-foreground">
              No sign up required · Parts list in seconds · Save when ready
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (pageState === "creating") {
    return <CreatingState completedSteps={completedSteps} />
  }

  // Chatting state
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Navbar */}
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Logo variant="icon" size="md" />
          <div className="flex gap-2">
            <Link href="/auth/login">
              <Button variant="outline" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="sm" className="bg-brand text-white hover:bg-brand/90">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-[520px]">
          {/* Conversation card */}
          <div className="rounded-lg border border-border bg-card">
            {/* Header */}
            <div className="border-b border-border px-4 py-3 flex items-center gap-2">
              <span className="size-2 bg-green-600 rounded-full" />
              <span className="font-medium text-sm">Wrench advisor</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {conversationState === "gathering" && "Tell me about your build"}
                {conversationState === "confirming" && "Ready to create?"}
                {conversationState === "ready" && "Creating..."}
              </span>
            </div>

            {/* Messages */}
            <div className="min-h-[280px] max-h-[60vh] overflow-y-auto flex flex-col gap-3 p-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-lg px-4 py-3 text-sm",
                    msg.role === "assistant"
                      ? "self-start bg-secondary text-secondary-foreground rounded-[4px_12px_12px_12px]"
                      : "self-end bg-[#D97706] text-white rounded-[12px_4px_12px_12px]",
                  )}
                >
                  <p className="whitespace-pre-line">{msg.content}</p>
                </div>
              ))}

              {isLoading && (
                <div className="self-start flex gap-1 py-3 px-4">
                  <span className="size-2 bg-secondary rounded-full animate-bounce" />
                  <span
                    className="size-2 bg-secondary rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <span
                    className="size-2 bg-secondary rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Confirmation card */}
            {conversationState === "confirming" && (
              <div className="border-t border-border px-4 py-3 bg-green-50 dark:bg-green-950">
                <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">
                  Ready to build
                </p>
                <p className="font-medium text-sm text-foreground mb-1">
                  {extracted.car}
                </p>
                <p className="text-sm text-muted-foreground mb-1">
                  {extracted.goal}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {extracted.use_case}
                </p>
                <Button
                  onClick={handleConfirm}
                  disabled={isLoading}
                  className="w-full bg-brand text-white hover:bg-brand/90"
                >
                  Yes, generate my parts list →
                </Button>
              </div>
            )}

            {/* Chips and input */}
            {conversationState !== "confirming" && (
              <>
                {conversationChips.length > 0 && (
                  <div className="border-t border-border px-4 py-3 flex flex-wrap gap-2">
                    {conversationChips.map((chip) => (
                      <button
                        key={chip}
                        onClick={() => handleChipClick(chip)}
                        disabled={isLoading}
                        className="rounded-full border border-border bg-background px-3 py-1.5 text-xs transition-colors hover:border-[#D97706] hover:text-[#D97706] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                <div className="border-t border-border px-4 py-3 flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isLoading) {
                        handleSendMessage(input)
                      }
                    }}
                    placeholder="Type here..."
                    disabled={isLoading}
                    autoFocus
                    className="flex-1"
                  />
                  <Button
                    onClick={() => handleSendMessage(input)}
                    disabled={isLoading || !input.trim()}
                    size="icon-sm"
                    className="bg-[#D97706] hover:bg-[#B45309] text-white"
                  >
                    →
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function CreatingState({ completedSteps }: { completedSteps: number }) {
  const steps = [
    "Build understood",
    "Generating parts list",
    "Finding vendor pricing",
    "Finalizing build",
  ]

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-background px-4">
      {/* Spinner */}
      <div className="size-16 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />

      {/* Text */}
      <p className="text-sm font-medium text-foreground">Creating your build…</p>

      {/* Steps */}
      <div className="w-full max-w-xs space-y-3">
        {steps.map((step, i) => {
          const isDone = i < completedSteps
          const isActive = i === completedSteps

          return (
            <div key={step} className="flex items-center gap-3">
              {isDone ? (
                <span className="flex size-5 shrink-0 items-center justify-center text-green-600">
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              ) : isActive ? (
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <span className="size-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                </span>
              ) : (
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <span className="size-2 rounded-full bg-border" />
                </span>
              )}
              <span
                className={cn(
                  "text-sm",
                  isDone
                    ? "text-foreground"
                    : isActive
                      ? "font-medium text-amber-600"
                      : "text-muted-foreground",
                )}
              >
                {step}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
