import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sunoApi, SUNO_MODELS, DEFAULT_MODEL } from "../lib/SunoApi.js";
import {
  checkCaptchaRequired,
  getLastChallenge,
  getCaptchaHandler,
  CaptchaChallenge,
} from "./captcha.js";
import { detectSfx, sfxMCPWarning } from "../lib/sfx-detector.js";

const ALLOW_SFX_DESC = 'Set to true to bypass SFX detection warning. Suno cannot reliably generate sound effects (footsteps, explosions, UI sounds, etc.) — only use if you accept the risk of unusable output.';

/**
 * Create and configure the Suno MCP server with all tool definitions.
 */
export function createSunoMcpServer() {
  const server = new McpServer(
    {
      name: "sunobridge",
      version: "1.2.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // --- Tool: get_credits ---
  server.tool(
    "get_credits",
    "Get the remaining credits and usage limits for the Suno account",
    {},
    async () => {
      try {
        const api = await sunoApi();
        const credits = await api.get_credits();
        return {
          content: [{ type: "text", text: JSON.stringify(credits, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool: generate ---
  server.tool(
    "generate",
    "Generate music from a text prompt using Suno AI. Returns audio clip metadata.",
    {
      prompt: z.string().describe("Text description of the music to generate"),
      make_instrumental: z
        .boolean()
        .optional()
        .default(false)
        .describe("Generate instrumental only (no vocals)"),
      model: z
        .string()
        .optional()
        .describe(
          `Model version to use. Options: ${Object.values(SUNO_MODELS).join(", ")}. Default: ${DEFAULT_MODEL}`
        ),
      wait_audio: z
        .boolean()
        .optional()
        .default(false)
        .describe("Wait for audio generation to complete before returning"),
      allow_sfx: z
        .boolean()
        .optional()
        .default(false)
        .describe(ALLOW_SFX_DESC),
    },
    async ({ prompt, make_instrumental, model, wait_audio, allow_sfx }) => {
      try {
        // SFX check
        const sfx = detectSfx(prompt);
        if (sfx.isSfx && !allow_sfx) {
          return {
            content: [{ type: "text", text: sfxMCPWarning() }],
            isError: true,
          };
        }

        const api = await sunoApi();
        const result = await api.generate(
          prompt,
          make_instrumental,
          model,
          wait_audio
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool: custom_generate ---
  server.tool(
    "custom_generate",
    "Generate music with fine-grained control over lyrics, style tags, and title",
    {
      prompt: z.string().describe("Lyrics or detailed description for the song"),
      tags: z.string().describe('Style tags, e.g. "pop, upbeat, energetic"'),
      title: z.string().describe("Title for the song"),
      make_instrumental: z
        .boolean()
        .optional()
        .default(false)
        .describe("Generate instrumental only"),
      model: z
        .string()
        .optional()
        .describe(`Model version. Default: ${DEFAULT_MODEL}`),
      wait_audio: z
        .boolean()
        .optional()
        .default(false)
        .describe("Wait for audio generation to complete"),
      negative_tags: z
        .string()
        .optional()
        .describe('Styles to avoid, e.g. "heavy metal, screaming"'),
      allow_sfx: z
        .boolean()
        .optional()
        .default(false)
        .describe(ALLOW_SFX_DESC),
    },
    async ({
      prompt,
      tags,
      title,
      make_instrumental,
      model,
      wait_audio,
      negative_tags,
      allow_sfx,
    }) => {
      try {
        // SFX check
        const sfx = detectSfx(prompt, tags);
        if (sfx.isSfx && !allow_sfx) {
          return {
            content: [{ type: "text", text: sfxMCPWarning() }],
            isError: true,
          };
        }

        const api = await sunoApi();
        const result = await api.custom_generate(
          prompt,
          tags,
          title,
          make_instrumental,
          model,
          wait_audio,
          negative_tags
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool: generate_lyrics ---
  server.tool(
    "generate_lyrics",
    "Generate song lyrics from a topic or theme prompt",
    {
      prompt: z.string().describe("Topic or theme for the lyrics"),
    },
    async ({ prompt }) => {
      try {
        const api = await sunoApi();
        const result = await api.generateLyrics(prompt);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool: get_audio ---
  server.tool(
    "get_audio",
    "Get status and details for audio clips by their IDs, or list recent generations",
    {
      ids: z
        .string()
        .optional()
        .describe("Comma-separated audio clip IDs. If omitted, lists recent generations."),
      page: z.string().optional().describe("Page number for pagination"),
    },
    async ({ ids, page }) => {
      try {
        const api = await sunoApi();
        const songIds = ids ? ids.split(",").map((id) => id.trim()) : undefined;
        const result = await api.get(songIds, page);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool: extend_audio ---
  server.tool(
    "extend_audio",
    "Extend an existing audio clip by generating additional content from a specific timestamp",
    {
      audio_id: z.string().describe("ID of the audio clip to extend"),
      prompt: z
        .string()
        .optional()
        .default("")
        .describe("New lyrics or description for the extension"),
      continue_at: z
        .number()
        .describe("Timestamp in seconds where the extension should start"),
      tags: z.string().optional().default("").describe("Style tags for the extension"),
      negative_tags: z.string().optional().default("").describe("Styles to avoid"),
      title: z.string().optional().default("").describe("Title for the extended version"),
      model: z
        .string()
        .optional()
        .describe(`Model version. Default: ${DEFAULT_MODEL}`),
      wait_audio: z
        .boolean()
        .optional()
        .default(false)
        .describe("Wait for generation to complete"),
      allow_sfx: z
        .boolean()
        .optional()
        .default(false)
        .describe(ALLOW_SFX_DESC),
    },
    async ({
      audio_id,
      prompt,
      continue_at,
      tags,
      negative_tags,
      title,
      model,
      wait_audio,
      allow_sfx,
    }) => {
      try {
        // SFX check
        if (prompt) {
          const sfx = detectSfx(prompt, tags);
          if (sfx.isSfx && !allow_sfx) {
            return {
              content: [{ type: "text", text: sfxMCPWarning() }],
              isError: true,
            };
          }
        }

        const api = await sunoApi();
        const result = await api.extendAudio(
          audio_id,
          prompt,
          continue_at,
          tags,
          negative_tags,
          title,
          model,
          wait_audio
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool: generate_stems ---
  server.tool(
    "generate_stems",
    "Separate an audio clip into individual stem tracks (vocals, drums, bass, etc.)",
    {
      audio_id: z.string().describe("ID of the audio clip to separate into stems"),
    },
    async ({ audio_id }) => {
      try {
        const api = await sunoApi();
        const result = await api.generateStems(audio_id);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool: concat ---
  server.tool(
    "concat",
    "Concatenate extended audio segments into a single complete song",
    {
      clip_id: z
        .string()
        .describe("ID of the final clip in an extension chain to concatenate"),
    },
    async ({ clip_id }) => {
      try {
        const api = await sunoApi();
        const result = await api.concatenate(clip_id);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool: check_auth (NEW) ---
  server.tool(
    "check_auth",
    "Verify Suno cookie/JWT is valid and show remaining credits. Also checks if captcha handler is registered.",
    {},
    async () => {
      try {
        const api = await sunoApi();
        let creditsInfo: any = null;
        let creditError: string | null = null;

        try {
          creditsInfo = await api.get_credits();
        } catch (e: any) {
          creditError = e.message;
        }

        // Detect captcha handler status
        const hasCaptchaHandler = getCaptchaHandler() !== null;
        const lastChallenge = getLastChallenge();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  auth_status: creditsInfo ? "valid" : "expired_or_invalid",
                  credits: creditsInfo || null,
                  credit_error: creditError,
                  captcha_handler: hasCaptchaHandler
                    ? "registered"
                    : "not_registered",
                  last_captcha_challenge: lastChallenge || null,
                  tips: [
                    "Cookie expires after 1-3 days. Re-run 'node setup-cookie.js' to refresh.",
                    "Visit https://suno.com/create to get a fresh cookie.",
                    "Register a captcha handler with registerCaptchaHandler() for automatic bypass.",
                    "Use solve_captcha tool to manually solve a pending captcha challenge.",
                  ],
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool: solve_captcha (NEW) ---
  server.tool(
    "solve_captcha",
    "Check if captcha is required and attempt to solve it via registered handler or manual token. Use this when generation fails with captcha/422 errors.",
    {
      manual_token: z
        .string()
        .optional()
        .describe(
          "If you have a pre-solved hCaptcha token (e.g. from vision AI), paste it here. Must start with 'P0_' or 'P1_'."
        ),
    },
    async ({ manual_token }) => {
      try {
        const api = await sunoApi();

        // If user provided a manual token, inject it
        if (manual_token) {
          if (
            !manual_token.startsWith("P0_") &&
            !manual_token.startsWith("P1_")
          ) {
            return {
              content: [
                {
                  type: "text",
                  text: "Invalid token format. hCaptcha tokens start with 'P0_' or 'P1_'.",
                },
              ],
              isError: true,
            };
          }

          // Inject the token via the SunoApi's captcha handler mechanism
          const { registerCaptchaHandler, unregisterCaptchaHandler } =
            await import("./captcha.js");
          let resolved = false;
          registerCaptchaHandler(async (_challenge) => {
            if (resolved) return null;
            resolved = true;
            return {
              token: manual_token,
              method: "manual",
              solvedAt: Date.now(),
            };
          });

          // Now try to generate (which will use the token)
          try {
            const result = await api.generate(
              "test instrumental",
              true,
              undefined,
              true
            );
            unregisterCaptchaHandler();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      message: "Manual token applied — generation succeeded",
                      captcha: "solved",
                      result,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (e: any) {
            unregisterCaptchaHandler();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      message: "Manual token applied but generation failed",
                      error: e.message,
                      note: "Token may be expired or invalid. Get a fresh one.",
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }

        // No manual token — check captcha status
        const checkResult = await api.checkCaptchaStatus();

        const hasHandler = getCaptchaHandler() !== null;
        const lastChallenge = getLastChallenge();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  captcha_required: checkResult.required || false,
                  captcha_handler: hasHandler ? "registered" : "not_registered",
                  last_challenge: lastChallenge,
                  instructions: checkResult.required
                    ? hasHandler
                      ? "Captcha is required but a handler is registered. Next generate() call will auto-solve."
                      : "Captcha is required and NO handler is registered! Options:\n1. Call solve_captcha with manual_token (from vision AI)\n2. Use Bridge Mode (Chrome Extension auto-solves)\n3. Register a captcha handler: registerCaptchaHandler()\n4. Set TWOCAPTCHA_KEY in .env"
                    : "No captcha required at this time. You can proceed with generation.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool: batch_generate (NEW) ---
  server.tool(
    "batch_generate",
    "Generate multiple music tracks from a JSON array of prompts. Supports resume (skip already-completed tracks via progress.json). Each track: { id, category, prompt, tags?, title?, make_instrumental?, model?, negative_tags? }",
    {
      tracks_json: z
        .string()
        .describe(
          "JSON string of track array. Each track: { id, category, prompt, tags?, title?, make_instrumental?, model?, negative_tags? }. Example: '[{\"id\":\"bgm_battle\",\"category\":\"bgm\",\"prompt\":\"epic battle music\",\"tags\":\"orchestral\",\"make_instrumental\":true}]'"
        ),
      output_dir: z
        .string()
        .optional()
        .default("./output/suno")
        .describe("Directory to save downloaded audio files"),
      cooldown: z
        .number()
        .optional()
        .default(5)
        .describe("Seconds to wait between tracks (rate limiting)"),
      max_poll_time: z
        .number()
        .optional()
        .default(120)
        .describe("Max seconds to wait per track for generation"),
      allow_sfx: z
        .boolean()
        .optional()
        .default(false)
        .describe(ALLOW_SFX_DESC),
    },
    async ({ tracks_json, output_dir, cooldown, max_poll_time, allow_sfx }) => {
      try {
        const fs = await import("fs");
        const path = await import("path");

        let tracks: any[];
        try {
          tracks = JSON.parse(tracks_json);
          if (!Array.isArray(tracks) || tracks.length === 0) {
            throw new Error("tracks_json must be a non-empty JSON array");
          }
        } catch (e: any) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid tracks_json: ${e.message}. Expected a JSON array of track objects.`,
              },
            ],
            isError: true,
          };
        }

        // SFX pre-scan: warn about tracks requesting sound effects
        if (!allow_sfx) {
          const sfxTracks = tracks.filter((t: any) => detectSfx(t.prompt || '', t.tags).isSfx);
          if (sfxTracks.length > 0) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  error: `${sfxTracks.length} track(s) appear to request SFX/sound effects`,
                  warning: sfxMCPWarning(),
                  sfx_track_ids: sfxTracks.map((t: any) => t.id),
                  hint: 'Set "allow_sfx": true to force generation anyway.',
                }, null, 2),
              }],
              isError: true,
            };
          }
        }

        const api = await sunoApi();
        const progressFile = path.join(output_dir, "progress.json");

        // Load existing progress
        let progress: any = { completed: {}, stats: { total_generated: 0, total_clips: 0, errors: 0 } };
        try {
          if (fs.existsSync(progressFile)) {
            progress = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
          }
        } catch {
          // fresh start
        }

        const pending = tracks.filter(
          (t: any) => !progress.completed[t.id]
        );
        const alreadyDone = tracks.length - pending.length;
        const results: any[] = [];

        // Report already completed
        if (alreadyDone > 0) {
          results.push({
            type: "skipped",
            count: alreadyDone,
            message: `${alreadyDone} tracks already completed (in progress.json)`,
          });
        }

        // Process each pending track
        for (let i = 0; i < pending.length; i++) {
          const track = pending[i];
          const trackNum = alreadyDone + i + 1;

          try {
            // Check credits before each track
            try {
              const credits = await api.get_credits();
              if (credits.credits_left <= 0) {
                results.push({
                  track_id: track.id,
                  success: false,
                  error: `No credits remaining! (${credits.credits_left} left). Purchase more at https://suno.com`,
                });
                progress.stats.errors++;
                break; // Stop batch
              }
            } catch {
              // credit check failed but continue
            }

            // Generate
            const clips = await api.custom_generate(
              track.prompt,
              track.tags || "",
              track.title || track.id,
              track.make_instrumental ?? true,
              track.model || undefined,
              true, // wait_audio = true
              track.negative_tags || undefined
            );

            // Record progress
            for (const clip of clips) {
              if (clip.status === "streaming" || clip.status === "complete") {
                progress.completed[track.id] = {
                  clip_id: clip.id,
                  audio_url: clip.audio_url || "",
                  status: clip.status,
                  generated_at: new Date().toISOString(),
                };
              }
            }

            progress.stats.total_generated++;
            progress.stats.total_clips += clips.length;
            fs.mkdirSync(output_dir, { recursive: true });
            fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2), "utf-8");

            results.push({
              track_id: track.id,
              success: true,
              clips_count: clips.length,
              clips: clips.map((c: any) => ({
                id: c.id,
                title: c.title,
                audio_url: c.audio_url,
                status: c.status,
                duration: c.duration,
              })),
            });
          } catch (e: any) {
            progress.stats.errors++;
            fs.mkdirSync(output_dir, { recursive: true });
            fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2), "utf-8");

            results.push({
              track_id: track.id,
              success: false,
              error: e.message,
            });

            // If captcha error, suggest intervention
            if (
              e.message?.includes("captcha") ||
              e.message?.includes("422") ||
              e.message?.includes("token")
            ) {
              results.push({
                type: "captcha_hint",
                message:
                  "Captcha detected! Use solve_captcha tool, or switch to Bridge Mode (Chrome Extension), or set TWOCAPTCHA_KEY.",
              });
              break; // Stop on captcha
            }
          }

          // Cooldown
          if (i < pending.length - 1) {
            await new Promise((r) => setTimeout(r, (cooldown || 5) * 1000));
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  summary: {
                    total: tracks.length,
                    already_completed: alreadyDone,
                    processed: results.filter((r: any) => r.track_id).length,
                    errors: progress.stats.errors,
                  },
                  progress_file: progressFile,
                  results,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool: list_completed (NEW) ---
  server.tool(
    "list_completed",
    "List all completed tracks from a batch generation progress file. Shows which tracks are done and their clip IDs.",
    {
      output_dir: z
        .string()
        .optional()
        .default("./output/suno")
        .describe("Directory containing progress.json"),
    },
    async ({ output_dir }) => {
      try {
        const fs = await import("fs");
        const path = await import("path");
        const progressFile = path.join(output_dir, "progress.json");

        if (!fs.existsSync(progressFile)) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    message: "No progress file found",
                    path: progressFile,
                    completed: {},
                    stats: { total_generated: 0, total_clips: 0, errors: 0 },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const progress = JSON.parse(
          fs.readFileSync(progressFile, "utf-8")
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  path: progressFile,
                  ...progress,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
