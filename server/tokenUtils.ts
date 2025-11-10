import { randomBytes } from "crypto";

export function generateViewToken(): string {
  return randomBytes(16).toString("hex");
}
