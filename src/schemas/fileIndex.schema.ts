import { z } from "zod";

export const FileRecordSchema = z.object({
  path: z.string(), // repo-relative, posix style
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  lang: z.string(), // e.g. "ts", "js", "json", "md", "unknown"
  isBinary: z.boolean(),
  mtimeMs: z.number().int().nonnegative().optional() // optional; do NOT include in determinism outputs unless opted in
});

export const FileIndexSchema = z.object({
  schemaVersion: z.literal("1.0"),
  repoRoot: z.string(),
  generatedAtIso: z.string(), // metadata only; ok here but do not include in inputHash
  files: z.array(FileRecordSchema),
  totals: z.object({
    fileCount: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative()
  })
});

export type FileRecord = z.infer<typeof FileRecordSchema>;
export type FileIndex = z.infer<typeof FileIndexSchema>;
