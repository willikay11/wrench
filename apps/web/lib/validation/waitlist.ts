import { z } from "zod";

/**
 * Shared by the client form and the server action, so the two cannot drift.
 * The client copy is UX — it avoids a pointless round trip. The server copy
 * is the authority, and runs whether or not the client bothered.
 *
 * Note the .pipe(): in zod 4, z.email() validates the value it is given, so
 * trimming has to happen *before* it rather than as a chained refinement.
 * Written the other way round, "  a@b.com  " fails validation.
 */
export const waitlistSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      z.email({ message: "That doesn't look like a valid email address." }),
    ),
});

export type WaitlistInput = z.infer<typeof waitlistSchema>;
