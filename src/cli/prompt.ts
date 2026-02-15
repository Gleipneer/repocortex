import { promptText, promptYesNo } from "../core/prompt.js";

/**
 * Prompt for a single line. If stdin is not a TTY or nonInteractive, return default immediately.
 * When nonInteractive and no defaultValue, returns "" (caller should validate and throw).
 */
export function prompt(
  question: string,
  defaultValue: string,
  nonInteractive?: boolean
): Promise<string> {
  if (nonInteractive || !process.stdin.isTTY) {
    return Promise.resolve(defaultValue);
  }
  return promptText(question, defaultValue || undefined);
}

/**
 * Ask Y/n; default Y. Returns true for yes, false for no. When nonInteractive, returns true.
 */
export function confirm(question: string, nonInteractive?: boolean): Promise<boolean> {
  if (nonInteractive || !process.stdin.isTTY) {
    return Promise.resolve(true);
  }
  return promptYesNo(question, true);
}
