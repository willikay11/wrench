// Shared types used by both web and any future packages

export type BuildStatus = "planning" | "in_progress" | "complete"
export type PartStatus = "needed" | "ordered" | "sourced" | "installed"
export type PartCategory = "engine" | "drivetrain" | "electrical" | "cooling" | "safety" | "other"
export type MessageRole = "user" | "assistant"

export interface Build {
  id: string
  userId: string
  title: string
  donorCar: string | null
  engineSwap: string | null
  goals: string[]
  imageUrl: string | null
  visionData: VisionData | null
  status: BuildStatus
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export interface VisionData {
  make: string
  model: string
  yearRange: string
  visibleMods: string[]
  engineHints: string[]
  confidence: {
    make: number
    model: number
    year: number
  }
}

export interface Part {
  id: string
  buildId: string
  name: string
  category: PartCategory | null
  isSafetyCritical: boolean
  status: PartStatus
  notes: string | null
  listings?: PartListing[]
}

export interface PartListing {
  id: string
  partId: string
  vendor: string
  url: string | null
  priceUsd: number | null
  shippingUsd: number | null
  sellerRating: number | null
  inStock: boolean | null
  fetchedAt: string
}

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: string
}
