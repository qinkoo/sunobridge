/**
 * SFX (Sound Effects) intent detector for Suno generation prompts.
 *
 * Suno AI is designed for MUSIC generation (songs, instrumentals, background music).
 * It CANNOT reliably generate sound effects (footsteps, explosions, gunshots,
 * UI sounds, whooshes, etc.). When users request SFX, we warn and block unless
 * they explicitly opt-in with allow_sfx=true.
 */

/** Primary SFX keywords — strong signals of non-musical audio intent */
const SFX_KEYWORDS = [
  // English — sound effect categories
  'sfx', 'sound effect', 'sound effects', 'sound fx', 'foley',
  // English — common SFX types
  'footstep', 'footsteps', 'gunshot', 'gun shot', 'gunfire',
  'explosion', 'explode', 'blast',
  'whoosh', 'swoosh', 'swish',
  'impact', 'punch', 'slash', 'sword swing',
  'door creak', 'door open', 'door close', 'door slam',
  'engine rev', 'car engine', 'motorcycle',
  'beep', 'buzzer', 'alarm sound', 'notification',
  'ui sound', 'button click', 'mouse click', 'keyboard',
  'typing', 'page flip', 'page turn',
  'rain', 'thunder', 'wind', 'water drip',
  'glass break', 'shatter',
  'magic spell', 'spell cast', 'fireball',
  'laser', 'zap', 'electric shock',
  'crowd cheer', 'applause', 'boo',
  'scream', 'shout', 'yell', 'gasp',
  'ambience', 'ambient sound', 'environmental sound', 'room tone',
  // Chinese — 音效
  '音效', '特效音', '声效', '拟音',
  '脚步声', '枪声', '爆炸声', '挥剑声',
  '风声', '雨声', '雷声',
  '开门声', '关门声', '玻璃破碎',
  'UI音效', '按钮音效', '点击音效',
  '魔法音效', '技能音效',
  '环境音', '环境音效',
  '打字声', '翻书声',
  '引擎声', '汽车引擎',
];

/** Compiled regex for case-insensitive matching */
const SFX_PATTERN = new RegExp(
  SFX_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

export interface SfxDetectionResult {
  /** Whether the prompt appears to be requesting SFX */
  isSfx: boolean;
  /** Human-readable warning message */
  warning: string;
}

const SFX_WARNING = [
  '⚠️  SFX DETECTED: Suno AI is designed for MUSIC generation (songs, instrumentals, BGM).',
  'It CANNOT reliably generate sound effects (footsteps, explosions, UI sounds, etc.).',
  'The generated result will likely be unusable for SFX purposes.',
  '',
  'To proceed anyway, add "allow_sfx": true to your request.',
].join('\n');

/**
 * Detect if a prompt (and optional tags) is requesting SFX/sound effects.
 * Returns the detection result with warning message.
 */
export function detectSfx(prompt: string, tags?: string): SfxDetectionResult {
  const text = [prompt, tags].filter(Boolean).join(' ').toLowerCase();

  // Quick pre-check: if it clearly looks like music, skip expensive regex
  if (/music|song|lyrics?|melody|beat|rhythm|chorus|verse|instrumental|bgm|background music|ost|soundtrack|genre|tempo|key of|chord|harmony/.test(text)) {
    // Music-related but could still be SFX-masquerading — only check
    // if there's also an explicit SFX keyword present
    if (!/\b(sfx|sound effect|foley|音效|特效音|声效|拟音)\b/i.test(text)) {
      // No explicit SFX keyword + has music terms = likely music, not SFX
      return { isSfx: false, warning: SFX_WARNING };
    }
  }

  const isSfx = SFX_PATTERN.test(text);
  return { isSfx, warning: SFX_WARNING };
}

/**
 * Generate a standardized SFX block response for API routes.
 * Use status 422 (Unprocessable Content) to signal this is not a server error
 * but a rejected request.
 */
export function sfxBlockResponse(corsHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: 'SFX request blocked',
      warning: SFX_WARNING,
      sfx_detected: true,
      hint: 'Set "allow_sfx": true in the request body to force generation anyway.',
    }),
    {
      status: 422,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

/**
 * Generate a standardized SFX warning for MCP tool text responses.
 */
export function sfxMCPWarning(): string {
  return SFX_WARNING;
}
