"use server";

import { waitlistSchema } from "@/lib/validation/waitlist";

/**
 * Waitlist signup.
 *
 * This runs on the server so CHANNEL_TOKEN never reaches the browser. A
 * client-side fetch straight to Kong would need NEXT_PUBLIC_CHANNEL_TOKEN,
 * which embeds the credential in the JS bundle. The browser talks to our own
 * origin; only this module holds the token.
 */

export type JoinWaitlistResult =
  /** Rejected for a bad address — shown inline on the field. */
  | { status: "invalid"; message: string }
  /** Anything the user cannot fix by editing the address — shown as a toast. */
  | { status: "error"; message: string }
  | { status: "success" };

const REQUEST_TIMEOUT_MS = 10_000;

export async function joinWaitlist(input: unknown): Promise<JoinWaitlistResult> {
  // Re-validated here even though the client already did: a server action is
  // a public HTTP endpoint, reachable without going through our form.
  const parsed = waitlistSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "invalid",
      message: parsed.error.issues[0]?.message ?? "That doesn't look like a valid email address.",
    };
  }

  const { email } = parsed.data;

  const baseUrl = process.env.API_BASE_URL;
  const channelToken = process.env.CHANNEL_TOKEN;

  if (!baseUrl || !channelToken) {
    // Misconfiguration, not user error. Never name which one is missing in a
    // user-facing string.
    console.error("waitlist: API_BASE_URL or CHANNEL_TOKEN is not configured");
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  let response: Response;

  try {
    response = await fetch(`${baseUrl}/v1/waitlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Channel-Token": channelToken,
      },
      body: JSON.stringify({ email }),
      // Without this a hung upstream leaves the button spinning indefinitely.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (cause) {
    // Network failure or timeout. Log the shape, never the address — the
    // project logging standard forbids PII in logs.
    console.error("waitlist: request failed", {
      reason: cause instanceof Error ? cause.name : "unknown",
    });
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  // A repeat signup is a success, not a duplicate error: the API upserts and
  // only queues a welcome email when the row is genuinely new. It does not
  // distinguish, deliberately, so we cannot leak whether an address is
  // already registered.
  if (response.ok) {
    return { status: "success" };
  }

  if (response.status === 400) {
    return { status: "invalid", message: "That doesn't look like a valid email address." };
  }

  if (response.status === 429) {
    return { status: "error", message: "Too many attempts. Please try again shortly." };
  }

  console.error("waitlist: upstream rejected the request", { status: response.status });
  return { status: "error", message: "Something went wrong. Please try again." };
}
