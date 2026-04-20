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
  const inputRef = React.useRef<HTMLInputElement>(null)

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
    [messages, sessionId, pageState],
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
        <header className="h-14 border-b border-border/30 px-4 py-3">
          <div className="flex items-center justify-between h-full">
            <div className="flex-1" />
            <div className="flex-1 flex justify-center">
              <Logo variant="full" size="md" />
            </div>
            <div className="flex-1 flex justify-end gap-2">
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

        {/* Main content - centered */}
        <main className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="w-full max-w-[420px] text-center mb-16">
            {/* Header */}
            <h1 className="mb-4 text-[32px] font-bold leading-tight tracking-tight">
              What are you building?
            </h1>
            <p className="text-base text-foreground/70">
              Describe your car and what you want to do — Wrench generates your
              complete parts list in seconds.
            </p>
          </div>
        </main>

        {/* Input area - anchored to bottom */}
        <div className="px-4 pb-5">
          <div className="mx-auto w-full max-w-[680px]">
            {/* Example chips - above input */}
            <div className="mb-3 flex flex-wrap gap-2 justify-center">
              {idleChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleChipClick(chip)}
                  disabled={isLoading}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[#D97706] hover:text-[#D97706] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    handleSendMessage(input)
                  }
                }}
                placeholder="e.g. K24 swap into my E30..."
                disabled={isLoading}
                className="flex-1 min-h-[52px] rounded-xl border border-border bg-card px-4 py-3 text-base placeholder:text-foreground/40 focus:border-[#D97706] focus:outline-none"
              />
              <Button
                onClick={() => handleSendMessage(input)}
                disabled={isLoading || !input.trim()}
                className="h-[52px] w-[36px] shrink-0 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white disabled:opacity-50"
              >
                →
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (pageState === "creating") {
    return <CreatingState completedSteps={completedSteps} />
  }

  // Chatting state - full viewport
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Navbar */}
      <header className="h-14 border-b border-border/30 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between h-full">
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

      {/* Messages area - fills middle space */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto w-full max-w-[680px]">
          <div className="flex flex-col gap-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-3 text-base",
                  msg.role === "assistant" ? "justify-start" : "justify-end"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    <span className="size-1.5 rounded-full bg-[#D97706]" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[60%] whitespace-pre-wrap leading-relaxed",
                    msg.role === "assistant"
                      ? "text-foreground"
                      : "rounded-2xl bg-[#D97706] px-4 py-2.5 text-white"
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <span className="size-1.5 rounded-full bg-[#D97706]" />
                </div>
                <div className="flex gap-1.5 items-center py-2">
                  <span className="size-1.5 bg-foreground/40 rounded-full animate-bounce" />
                  <span
                    className="size-1.5 bg-foreground/40 rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <span
                    className="size-1.5 bg-foreground/40 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>

      {/* Confirmation card - between messages and input */}
      {conversationState === "confirming" && (
        <div className="px-4 py-4 shrink-0">
          <div className="mx-auto w-full max-w-[680px] rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 p-4">
            <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-3">
              Ready to build
            </p>
            <p className="font-medium text-sm text-foreground mb-1">
              {extracted.car}
            </p>
            <p className="text-sm text-foreground/70 mb-1">
              {extracted.goal}
            </p>
            <p className="text-sm text-foreground/70 mb-4">
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
        </div>
      )}

      {/* Input area - anchored to bottom */}
      {conversationState !== "confirming" && (
        <div className="px-4 pb-5 shrink-0 border-t border-border/30">
          <div className="mx-auto w-full max-w-[680px] pt-4">
            {/* Chips above input if needed */}
            {conversationChips.length > 0 && (
              <div className="mb-3 flex gap-2">
                {conversationChips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleChipClick(chip)}
                    disabled={isLoading}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[#D97706] hover:text-[#D97706] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2">
              <Input
                ref={inputRef}
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
                className="flex-1 min-h-[52px] rounded-xl border border-border bg-card px-4 py-3 text-base placeholder:text-foreground/40 focus:border-[#D97706] focus:outline-none"
              />
              <Button
                onClick={() => handleSendMessage(input)}
                disabled={isLoading || !input.trim()}
                className="h-[52px] w-[36px] shrink-0 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white disabled:opacity-50"
              >
                →
              </Button>
            </div>
          </div>
        </div>
      )}
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
