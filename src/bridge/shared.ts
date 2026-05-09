/**
 * Shared utilities for bridge API handler and MCP server.
 * Extracted from api-handler.ts and mcp-bridge.ts to eliminate duplication.
 */
import type { WebSocketManager } from './ws-manager';
import { DEFAULT_MODEL } from '@/lib/SunoApi';

/** Check if captcha is required */
export async function checkCaptcha(wsManager: WebSocketManager): Promise<boolean> {
  try {
    const resp = await wsManager.sendRequest('api_call', {
      url: '/api/c/check',
      method: 'POST',
      body: { ctype: 'generation' },
    });
    if (resp.result?.data?.required !== undefined) {
      return resp.result.data.required;
    }
    return false;
  } catch {
    return false;
  }
}

/** Get a captcha token from the page script's hCaptcha */
export async function getCaptchaToken(wsManager: WebSocketManager): Promise<string | null> {
  try {
    const resp = await wsManager.sendRequest('get_captcha', {
      url: '', method: 'GET',
    }, 15_000);
    return resp.result?.data?.captchaToken || null;
  } catch {
    return null;
  }
}

/** Check captcha and add token to payload if needed */
export async function addCaptchaIfNeeded(wsManager: WebSocketManager, payload: any, label = ''): Promise<void> {
  const captchaRequired = await checkCaptcha(wsManager);
  if (captchaRequired) {
    const prefix = label ? `[${label}] ` : '';
    console.log(`${prefix}Captcha required, requesting token from page...`);
    const captchaToken = await getCaptchaToken(wsManager);
    if (captchaToken) {
      payload.token = captchaToken;
      console.log(`${prefix}Got captcha token`);
    } else {
      console.log(`${prefix}No captcha token available`);
    }
  }
}

/** Build the Suno API generate payload */
export function buildGeneratePayload(body: any, isCustom: boolean) {
  const payload: any = {
    make_instrumental: body.make_instrumental || false,
    mv: body.model || body.mv || DEFAULT_MODEL,
    prompt: '',
    generation_type: 'TEXT',
    metadata: {
      web_client_pathname: '/create',
      is_max_mode: false,
      is_mumble: false,
      create_mode: isCustom ? 'custom' : 'simple',
      create_session_token: crypto.randomUUID(),
      disable_volume_normalization: false,
      can_control_sliders: ['weirdness_constraint', 'style_weight'],
    },
    user_uploaded_images_b64: null,
    override_fields: [],
    cover_clip_id: null,
    cover_start_s: null,
    cover_end_s: null,
    persona_id: null,
    artist_clip_id: null,
    artist_start_s: null,
    artist_end_s: null,
    continued_aligned_prompt: null,
    transaction_uuid: crypto.randomUUID(),
  };

  if (isCustom) {
    payload.tags = body.tags || '';
    payload.title = body.title || '';
    payload.negative_tags = body.negative_tags || '';
    payload.prompt = body.prompt || '';
  } else {
    payload.gpt_description_prompt = body.prompt || '';
  }

  return payload;
}

/** Poll audio clips until complete or timeout */
export async function pollForCompletion(
  wsManager: WebSocketManager,
  clipIds: string[],
  timeoutMs = 100_000
): Promise<any[]> {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, 5000));

  while (Date.now() - start < timeoutMs) {
    const resp = await wsManager.sendRequest('api_call', {
      url: `/api/feed/v2?ids=${clipIds.join(',')}`,
      method: 'GET',
    });

    if (resp.result?.data?.clips) {
      const clips = resp.result.data.clips;
      const allDone = clips.every(
        (c: any) => c.status === 'streaming' || c.status === 'complete' || c.status === 'error'
      );
      if (allDone) return clips.map(normalizeClip);
    }

    await new Promise((r) => setTimeout(r, 4000));
  }

  return [];
}

/** Normalize a clip to AudioInfo format */
export function normalizeClip(clip: any) {
  return {
    id: clip.id,
    title: clip.title,
    image_url: clip.image_url,
    lyric: clip.metadata?.prompt || '',
    audio_url: clip.audio_url,
    video_url: clip.video_url,
    created_at: clip.created_at,
    model_name: clip.model_name,
    status: clip.status,
    gpt_description_prompt: clip.metadata?.gpt_description_prompt,
    prompt: clip.metadata?.prompt,
    type: clip.metadata?.type,
    tags: clip.metadata?.tags,
    negative_tags: clip.metadata?.negative_tags,
    duration: clip.metadata?.duration,
    error_message: clip.metadata?.error_message,
  };
}
