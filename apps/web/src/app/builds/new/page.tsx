"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { createBuild } from "@/lib/api/builds"
import { cn } from "@/lib/utils"

type ConvoState = {
  stage:
    | "idle"
    | "needs_car"
    | "recommending_cars"
    | "needs_goal"
    | "needs_use_case"
    | "confirming"
    | "creating"
  car: string | null
  goal: string | null
  useCase: string | null
  messages: Message[]
  isTyping: boolean
}

type Message = {
  role: "ai" | "user"
  text: string
}

const CAR_TERMS = [
  "e30",
  "e36",
  "e46",
  "bmw",
  "wrx",
  "subaru",
  "civic",
  "honda",
  "miata",
  "mazda",
  "corolla",
  "toyota",
  "golf",
  "vw",
  "volkswagen",
  "mustang",
  "ford",
  "supra",
  "land cruiser",
  "prado",
  "hilux",
  "impreza",
  "sti",
  "evo",
  "mitsubishi",
  "nissan",
  "240sx",
  "silvia",
  "skyline",
  "rx7",
  "rx-7",
]

const GOAL_TERMS = [
  "swap",
  "engine",
  "suspension",
  "brake",
  "rim",
  "wheel",
  "exhaust",
  "turbo",
  "intake",
  "intercooler",
  "coilover",
  "lowering",
  "infotainment",
  "stereo",
  "audio",
  "paint",
  "body",
  "aero",
  "spoiler",
  "upgrade",
  "build",
  "modify",
  "change",
  "install",
  "replace",
  "convert",
]

const CHIPS_PER_STAGE = {
  idle: [],
  needs_car: [
    "BMW E30",
    "Subaru WRX",
    "Honda Civic EK",
    "Mazda Miata",
    "Toyota Land Cruiser",
    "I'm still deciding",
  ],
  recommending_cars: [
    "BMW E30",
    "Mazda Miata",
    "Honda Civic",
    "Something else",
  ],
  needs_goal: [
    "Engine swap",
    "Suspension upgrade",
    "Brake upgrade",
    "Rim change",
    "Infotainment upgrade",
    "Full build",
  ],
  needs_use_case: ["Daily driver", "Track only", "Daily and track"],
  confirming: [],
  creating: [],
}

function detectCar(text: string): string | null {
  const lower = text.toLowerCase()
  for (const term of CAR_TERMS) {
    if (lower.includes(term)) return term
  }
  return null
}

function detectGoal(text: string): string | null {
  const lower = text.toLowerCase()
  for (const term of GOAL_TERMS) {
    if (lower.includes(term)) return term
  }
  return null
}

function getAIMessage(
  stage: ConvoState["stage"],
  car?: string,
  goal?: string,
  useCase?: string,
): string {
  switch (stage) {
    case "idle":
      return "What are you building?"
    case "needs_car":
      return "What car are you working on?"
    case "recommending_cars":
      return (
        "Three platforms that work really well for builds:\n\n" +
        "→ BMW E30 — lightweight, RWD, massive community\n" +
        "→ Mazda Miata — best supported, parts everywhere\n" +
        "→ Honda Civic EG/EK — reliable, cheap to run\n\n" +
        "Which of these interests you, or do you have another car in mind?"
      )
    case "needs_goal":
      return `What do you want to do with your ${car}?`
    case "needs_use_case":
      return "Last one — daily driver, track use, or both?"
    default:
      return ""
  }
}

export default function NewBuildPage() {
  const router = useRouter()
  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  const [state, setState] = React.useState<ConvoState>({
    stage: "idle",
    car: null,
    goal: null,
    useCase: null,
    messages: [{ role: "ai", text: "What are you building?" }],
    isTyping: false,
  })

  const [input, setInput] = React.useState("")
  const [creatingStartTime, setCreatingStartTime] = React.useState<number | null>(null)

  const scrollToBottom = React.useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  React.useEffect(() => {
    scrollToBottom()
  }, [state.messages, scrollToBottom])

  const handleSendMessage = React.useCallback(
    (text: string) => {
      if (!text.trim()) return

      const newMessages = [...state.messages, { role: "user" as const, text }]
      setState((s: ConvoState) => ({ ...s, messages: newMessages, isTyping: true }))
      setInput("")

      setTimeout(() => {
        setState((s: ConvoState) => {
          const { stage, car, goal } = s
          let newStage = stage
          let newCar = car
          let newGoal = goal
          let newUseCase = s.useCase
          let aiMessage = ""

          if (stage === "idle" || stage === "needs_car") {
            const detectedCar = detectCar(text)
            const detectedGoal = detectGoal(text)

            const isDeciding =
              text.toLowerCase().includes("deciding") ||
              text.toLowerCase().includes("not sure") ||
              text.toLowerCase().includes("don't have")

            if (isDeciding) {
              newStage = "recommending_cars"
              aiMessage = getAIMessage("recommending_cars")
            } else if (!detectedCar) {
              newStage = "needs_car"
              aiMessage = getAIMessage("needs_car")
            } else {
              newCar = detectedCar
              if (!detectedGoal) {
                newStage = "needs_goal"
                aiMessage = getAIMessage("needs_goal", newCar)
              } else {
                newGoal = detectedGoal
                newStage = "needs_use_case"
                aiMessage = getAIMessage("needs_use_case")
              }
            }
          } else if (stage === "recommending_cars") {
            newCar = text
            newStage = "needs_goal"
            aiMessage = getAIMessage("needs_goal", newCar)
          } else if (stage === "needs_goal") {
            newGoal = text
            newStage = "needs_use_case"
            aiMessage = getAIMessage("needs_use_case")
          } else if (stage === "needs_use_case") {
            newUseCase = text
            newStage = "confirming"
          }

          const messages = aiMessage
            ? [...s.messages, { role: "ai" as const, text: aiMessage }]
            : [...s.messages]

          return {
            ...s,
            stage: newStage,
            car: newCar,
            goal: newGoal,
            useCase: newUseCase,
            messages,
            isTyping: false,
          }
        })
      }, 1200)
    },
    [],
  )

  const handleChipClick = (chipText: string) => {
    handleSendMessage(chipText)
  }

  const handleConfirm = React.useCallback(async () => {
    if (!state.car || !state.goal || !state.useCase) return

    setState((s: ConvoState) => ({ ...s, stage: "creating" }))
    setCreatingStartTime(Date.now())

    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) throw new Error("Please sign in again.")

      const created = await createBuild(
        {
          title: `${state.car} — ${state.goal}`,
          car: state.car,
          goals: [state.goal],
          modification_goal: `${state.goal} for ${state.useCase} use`,
        },
        session.access_token,
      )

      const elapsed = Date.now() - (creatingStartTime || 0)
      const remaining = Math.max(0, 3200 - elapsed)

      setTimeout(() => {
        router.push(`/builds/${created.id}`)
      }, remaining)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create build",
      )
      setState((s: ConvoState) => ({ ...s, stage: "confirming" }))
    }
  }, [state.car, state.goal, state.useCase, router, creatingStartTime])

  const handleReset = () => {
    setState({
      stage: "idle",
      car: null,
      goal: null,
      useCase: null,
      messages: [{ role: "ai", text: "What are you building?" }],
      isTyping: false,
    })
    setInput("")
  }

  const chips: string[] = (CHIPS_PER_STAGE[state.stage as keyof typeof CHIPS_PER_STAGE] || [])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Topbar */}
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <a
            href="/builds"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← My builds
          </a>
          <Logo variant="icon" size="md" />
          <div className="w-20" />
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        {state.stage === "creating" ? (
          <CreatingState />
        ) : (
          <div className="w-full max-w-[540px]">
            {/* Messages */}
            <div className="mb-4 flex min-h-[280px] flex-col gap-3 rounded-lg border border-border bg-card p-4">
              {state.messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-lg px-4 py-3 text-sm",
                    msg.role === "ai"
                      ? "self-start bg-secondary text-secondary-foreground rounded-[4px_12px_12px_12px]"
                      : "self-end bg-[#D97706] text-white rounded-[12px_4px_12px_12px]",
                  )}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>
                </div>
              ))}

              {state.isTyping && (
                <div className="self-start flex gap-1 py-3 px-4">
                  <span className="size-2 bg-secondary rounded-full animate-bounce" />
                  <span className="size-2 bg-secondary rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                  <span className="size-2 bg-secondary rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Confirmation card */}
            {state.stage === "confirming" && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">
                  Ready to build
                </p>
                <p className="font-medium text-sm text-foreground mb-1">
                  {state.car}
                </p>
                <p className="text-sm text-muted-foreground mb-1">
                  {state.goal}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {state.useCase}
                </p>
                <Button
                  onClick={handleConfirm}
                  className="w-full bg-brand text-white hover:bg-brand/90 mb-2"
                >
                  Yes, let&apos;s go →
                </Button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full text-xs text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                >
                  Start over
                </button>
              </div>
            )}

            {/* Chips */}
            {chips.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleChipClick(chip)}
                    disabled={state.isTyping}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs transition-colors hover:border-[#D97706] hover:text-[#D97706] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !state.isTyping) {
                    handleSendMessage(input)
                  }
                }}
                placeholder="Type or pick from above…"
                disabled={state.isTyping}
                className="flex-1"
              />
              <Button
                onClick={() => handleSendMessage(input)}
                disabled={state.isTyping || !input.trim()}
                size="icon-sm"
                className="bg-[#D97706] hover:bg-[#B45309] text-white"
              >
                →
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function CreatingState() {
  const steps = [
    "Build saved",
    "Analysing modification",
    "Finding compatible parts",
    "Fetching vendor pricing",
  ]

  const [completedSteps, setCompletedSteps] = React.useState(0)

  React.useEffect(() => {
    if (completedSteps >= steps.length) return
    const timer = setTimeout(() => {
      setCompletedSteps((prev) => prev + 1)
    }, 800)
    return () => clearTimeout(timer)
  }, [completedSteps, steps.length])

  return (
    <div className="flex flex-col items-center justify-center gap-10">
      {/* Spinner */}
      <div className="size-16 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />

      {/* Text */}
      <p className="text-sm font-medium text-foreground">Creating your build…</p>

      {/* Steps */}
      <div className="w-full max-w-xs space-y-3">
        {steps.map((step, i) => {
          const isDone = i < completedSteps
          const isActive = i === completedSteps
          const isPending = i > completedSteps

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
