import { z } from "zod";

export const ArtifactIdentitySchema = z.object({
  schemaVersion: z.literal("1.0"),
  snapshotId: z.string(),
  inputHash: z.string().optional(),
  artifactHash: z.string().optional()
});

export const WrappedArtifactSchema = <T extends z.ZodTypeAny>(payloadSchema: T) =>
  z.object({
    identity: ArtifactIdentitySchema,
    payload: payloadSchema
  });

export type ArtifactIdentity = z.infer<typeof ArtifactIdentitySchema>;
