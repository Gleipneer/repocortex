import { createHash } from "node:crypto";

/**
 * 64-bit simhash from text. Deterministic: same text => same hash.
 * Tokenize by whitespace, hash each token to 64 bits, accumulate bit vector, sign.
 */
export function simhash64(text: string): string {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  const bits = new Int32Array(64);
  for (const t of tokens) {
    const h = createHash("sha256").update(t, "utf8").digest();
    for (let i = 0; i < 64; i++) {
      const byteIndex = i >> 3;
      const bitIndex = 7 - (i & 7);
      const byte = h[byteIndex] ?? 0;
      if ((byte >> bitIndex) & 1) bits[i] = (bits[i] ?? 0) + 1;
      else bits[i] = (bits[i] ?? 0) - 1;
    }
  }
  let out = 0n;
  for (let i = 0; i < 64; i++) {
    if (bits[i]! > 0) out |= 1n << BigInt(63 - i);
  }
  const buf = Buffer.allocUnsafe(8);
  buf.writeBigUInt64BE(out);
  return buf.toString("hex");
}

/** Hamming distance between two 64-bit hex strings (16 chars each). */
export function hammingDistance(hex1: string, hex2: string): number {
  if (hex1.length !== 16 || hex2.length !== 16) return 999;
  const a = BigInt("0x" + hex1);
  const b = BigInt("0x" + hex2);
  let x = a ^ b;
  let d = 0;
  while (x) {
    d += Number(x & 1n);
    x >>= 1n;
  }
  return d;
}
