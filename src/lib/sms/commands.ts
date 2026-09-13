/**
 * TCPA-style inbound SMS keywords.
 */

const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START = new Set(["START", "YES", "UNSTOP"]);
const HELP = new Set(["HELP", "INFO"]);

export type SmsCommand = "stop" | "start" | "help";

export function classifySmsCommand(body: string): SmsCommand | null {
  const token = body.trim().toUpperCase();
  if (!token) return null;
  if (STOP.has(token)) return "stop";
  if (START.has(token)) return "start";
  if (HELP.has(token)) return "help";
  return null;
}
