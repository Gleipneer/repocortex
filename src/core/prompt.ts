import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function promptText(question: string, def?: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    const q = def ? `${question} [${def}] ` : `${question} `;
    const ans = (await rl.question(q)).trim();
    return ans.length ? ans : (def ?? "");
  } finally {
    rl.close();
  }
}

export async function promptYesNo(question: string, defYes: boolean): Promise<boolean> {
  const def = defYes ? "Y/n" : "y/N";
  const rl = readline.createInterface({ input, output });
  try {
    const ans = (await rl.question(`${question} (${def}) `)).trim().toLowerCase();
    if (!ans) return defYes;
    if (["y", "yes"].includes(ans)) return true;
    if (["n", "no"].includes(ans)) return false;
    return defYes;
  } finally {
    rl.close();
  }
}
