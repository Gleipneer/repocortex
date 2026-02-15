import { createHash } from "node:crypto";

export function sha256(input: string | Buffer): string {
  if (typeof input === "string") {
    return createHash("sha256").update(input, "utf8").digest("hex");
  }
  return createHash("sha256").update(input).digest("hex");
}
