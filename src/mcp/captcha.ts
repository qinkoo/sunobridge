// ============================================================
// SunoBridge MCP — Captcha Bypass Interface
//
// Pluggable captcha handler registry for multi-modal AI agents,
// browser automation skills, or 2captcha/anti-captcha services.
//
// Usage:
//   import { registerCaptchaHandler } from "./captcha.js";
//   registerCaptchaHandler(async (challenge) => {
//     // Use vision AI to solve the captcha, or forward to a
//     // browser extension that has hCaptcha access.
//     return { token: "P0_eyJ...", method: "vision_ai", solvedAt: Date.now() };
//   });
// ============================================================

export interface CaptchaChallenge {
  /** hCaptcha sitekey (if available) */
  sitekey?: string;
  /** Page URL where captcha appeared */
  pageUrl: string;
  /** Captcha type: 'generation', 'login', 'stems', etc. */
  ctype: string;
  /** Unix ms timestamp when challenge was detected */
  timestamp: number;
  /** Additional context for the solver */
  metadata?: Record<string, unknown>;
}

export interface CaptchaSolution {
  /** hCaptcha/Cloudflare Turnstile response token */
  token: string;
  /** Which method was used to solve */
  method: "2captcha" | "manual" | "vision_ai" | "skill" | "bridge" | "capsolver";
  /** Unix ms timestamp when solved */
  solvedAt: number;
  /** Optional: cost or credits consumed */
  cost?: number;
}

/**
 * A captcha handler receives a challenge and returns either a solution
 * or null (meaning it cannot handle this challenge).
 */
export type CaptchaHandler = (
  challenge: CaptchaChallenge
) => Promise<CaptchaSolution | null>;

// ---- Global Registry ----

let registeredHandler: CaptchaHandler | null = null;
let lastChallenge: CaptchaChallenge | null = null;

/** Register a captcha handler. Overwrites any previous handler. */
export function registerCaptchaHandler(handler: CaptchaHandler): void {
  registeredHandler = handler;
  console.log("[Captcha] Handler registered ✓");
}

/** Remove the registered captcha handler */
export function unregisterCaptchaHandler(): void {
  registeredHandler = null;
  console.log("[Captcha] Handler unregistered");
}

/** Get the currently registered handler (may be null) */
export function getCaptchaHandler(): CaptchaHandler | null {
  return registeredHandler;
}

/** Get the last captcha challenge (for inspection / manual solving) */
export function getLastChallenge(): CaptchaChallenge | null {
  return lastChallenge;
}

/**
 * Attempt to solve a captcha challenge using the registered handler.
 * Returns null if no handler is registered or if the handler cannot solve.
 */
export async function solveCaptcha(
  challenge: CaptchaChallenge
): Promise<CaptchaSolution | null> {
  lastChallenge = challenge;
  const handler = registeredHandler;
  if (!handler) {
    console.log(
      `[Captcha] No handler registered — captcha required for ${challenge.ctype}`
    );
    return null;
  }
  try {
    console.log(`[Captcha] Solving with handler (type: ${challenge.ctype})...`);
    const solution = await handler(challenge);
    if (solution) {
      console.log(`[Captcha] Solved ✓ (method: ${solution.method})`);
    } else {
      console.log(`[Captcha] Handler returned null — captcha not solved`);
    }
    return solution;
  } catch (e: any) {
    console.error(`[Captcha] Handler error: ${e.message}`);
    return null;
  }
}

/**
 * Create a captcha challenge from the Suno captcha check response.
 */
export function createChallenge(
  response: { required: boolean; ctype?: string; sitekey?: string },
  pageUrl: string = "https://suno.com/create"
): CaptchaChallenge | null {
  if (!response.required) return null;
  return {
    sitekey: response.sitekey,
    pageUrl,
    ctype: response.ctype || "generation",
    timestamp: Date.now(),
  };
}

// ---- Helper: Check if captcha is required ----
// Thin wrapper that SunoApi can call instead of its own captchaRequired()

export async function checkCaptchaRequired(
  checkFn: () => Promise<{ required: boolean; ctype?: string }>
): Promise<CaptchaSolution | null> {
  try {
    const required = await checkFn();
    if (!required?.required) return null;
    const challenge = createChallenge(required);
    if (!challenge) return null;
    return solveCaptcha(challenge);
  } catch {
    return null;
  }
}
