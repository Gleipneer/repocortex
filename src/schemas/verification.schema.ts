import { z } from "zod";

/**
 * storage/verification/last_verification.json
 * Additive only; do not modify other schemas.
 */
export const LastVerificationSchema = z.object({
  schemaVersion: z.literal("1.0"),
  verifiedAtIso: z.string(),
  hashMatch: z.boolean(),
  schemaValid: z.boolean()
});

export type LastVerification = z.infer<typeof LastVerificationSchema>;
