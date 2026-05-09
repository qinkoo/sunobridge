/**
 * REST API handler — maps local endpoints to Suno API calls
 * routed through the Chrome extension via WebSocket.
 */

import type { WebSocketManager } from './ws-manager';
import { checkCaptcha, getCaptchaToken, addCaptchaIfNeeded, buildGeneratePayload, pollForCompletion, normalizeClip } from './shared';
import { detectSfx } from '@/lib/sfx-detector';

const SUNO_API_BASE = 'https://studio-api.prod.suno.com';

/** Route an incoming HTTP request to the extension */
export async function handleApiRequest(
  req: Request,
  wsManager: WebSocketManager
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  try {
    // Status endpoint
    if (path === '/api/status') {
      return json(wsManager.getStatus());
    }

    // Diagnostic: test token retrieval
    if (path === '/api/test') {
      if (!wsManager.isConnected) {
        return json({ error: 'No extension connected' }, 503);
      }
      console.log('[API] Testing token retrieval...');
      try {
        const tokenResp = await wsManager.sendRequest('get_token', {
          url: '', method: 'GET',
        });
        console.log('[API] Token response:', JSON.stringify(tokenResp).slice(0, 200));
        return json({ success: true, hasToken: !!tokenResp.result?.data?.token });
      } catch (err: any) {
        console.log('[API] Token test failed:', err.message);
        return json({ error: err.message }, 500);
      }
    }

    // GET /api/captcha_check — test if captcha is required
    if (method === 'GET' && path === '/api/captcha_check') {
      if (!wsManager.isConnected) return json({ error: 'No extension connected' }, 503);
      const resp = await wsManager.sendRequest('api_call', {
        url: '/api/c/check',
        method: 'POST',
        body: { ctype: 'generation' },
      });
      if (resp.error) return json({ error: resp.error.message }, 500);
      return json(resp.result!.data);
    }

    if (!wsManager.isConnected) {
      return json(
        { error: 'No extension connected. Open suno.com with the extension installed.' },
        503
      );
    }

    // POST /api/generate — simple generation
    if (method === 'POST' && path === '/api/generate') {
      const body = await req.json();
      const sfx = detectSfx(body.prompt || '');
      if (sfx.isSfx && !body.allow_sfx) {
        return json({ error: 'SFX request blocked', warning: sfx.warning, sfx_detected: true, hint: 'Set "allow_sfx": true to force generation.' }, 422);
      }
      return await proxyGenerate(wsManager, body, false);
    }

    // POST /api/custom_generate — custom generation with lyrics/tags/title
    if (method === 'POST' && path === '/api/custom_generate') {
      const body = await req.json();
      const sfx = detectSfx(body.prompt || '', body.tags);
      if (sfx.isSfx && !body.allow_sfx) {
        return json({ error: 'SFX request blocked', warning: sfx.warning, sfx_detected: true, hint: 'Set "allow_sfx": true to force generation.' }, 422);
      }
      return await proxyGenerate(wsManager, body, true);
    }

    // POST /api/generate_lyrics
    if (method === 'POST' && path === '/api/generate_lyrics') {
      const body = await req.json();
      return await proxyLyrics(wsManager, body);
    }

    // GET /api/get — get audio feed / status
    if (method === 'GET' && path === '/api/get') {
      const ids = url.searchParams.get('ids');
      const page = url.searchParams.get('page');
      let sunoUrl = '/api/feed/v2';
      const params = new URLSearchParams();
      if (ids) params.set('ids', ids);
      if (page) params.set('page', page);
      const qs = params.toString();
      if (qs) sunoUrl += `?${qs}`;

      const resp = await wsManager.sendRequest('api_call', {
        url: sunoUrl,
        method: 'GET',
      });
      if (resp.error) return json({ error: resp.error.message }, 500);
      return json(resp.result!.data);
    }

    // GET /api/get_limit — billing info
    if (method === 'GET' && path === '/api/get_limit') {
      console.log('[API] get_limit: sending request to extension...');
      const resp = await wsManager.sendRequest('api_call', {
        url: '/api/billing/info/',
        method: 'GET',
      });
      console.log('[API] get_limit: got response', JSON.stringify(resp).slice(0, 300));
      if (resp.error) return json({ error: resp.error.message }, 500);
      return json(resp.result!.data);
    }

    // POST /api/extend_audio
    if (method === 'POST' && path === '/api/extend_audio') {
      const body = await req.json();
      if (body.prompt) {
        const sfx = detectSfx(body.prompt, body.tags);
        if (sfx.isSfx && !body.allow_sfx) {
          return json({ error: 'SFX request blocked', warning: sfx.warning, sfx_detected: true, hint: 'Set "allow_sfx": true to force generation.' }, 422);
        }
      }
      return await proxyExtend(wsManager, body);
    }

    // POST /api/generate_stems
    if (method === 'POST' && path === '/api/generate_stems') {
      const body = await req.json();
      const songId = body.audio_id || body.song_id;
      if (!songId) return json({ error: 'audio_id is required' }, 400);

      const resp = await wsManager.sendRequest('api_call', {
        url: `/api/edit/stems/${songId}`,
        method: 'POST',
        body: {},
      });
      if (resp.error) return json({ error: resp.error.message }, 500);
      return json(resp.result!.data);
    }

    // POST /api/concat
    if (method === 'POST' && path === '/api/concat') {
      const body = await req.json();
      const resp = await wsManager.sendRequest('api_call', {
        url: '/api/generate/concat/v2/',
        method: 'POST',
        body: { clip_id: body.clip_id },
      });
      if (resp.error) return json({ error: resp.error.message }, 500);
      return json(resp.result!.data);
    }

    return json({ error: 'Not found' }, 404);
  } catch (err: any) {
    console.error('[API] Error:', err.message);
    return json({ error: err.message }, 500);
  }
}

/** Build and proxy a generation request */
async function proxyGenerate(
  wsManager: WebSocketManager,
  body: any,
  isCustom: boolean
): Promise<Response> {
  const payload = buildGeneratePayload(body, isCustom);

  await addCaptchaIfNeeded(wsManager, payload, 'API');

  const resp = await wsManager.sendRequest('api_call', {
    url: '/api/generate/v2/',
    method: 'POST',
    body: payload,
  });

  if (resp.error) return json({ error: resp.error.message }, 500);

  const data = resp.result!.data;

  // If wait_audio was requested, poll for completion
  if (body.wait_audio && data.clips) {
    const clipIds = data.clips.map((c: any) => c.id);
    return json(await pollForCompletion(wsManager, clipIds));
  }

  // Return normalized response
  if (data.clips) {
    return json(data.clips.map(normalizeClip));
  }
  return json(data);
}

/** Build and proxy an extend request */
async function proxyExtend(wsManager: WebSocketManager, body: any): Promise<Response> {
  const payload = buildGeneratePayload(
    { ...body, make_instrumental: false },
    true
  );
  payload.task = 'extend';
  payload.continue_clip_id = body.audio_id;
  payload.continue_at = body.continue_at;

  await addCaptchaIfNeeded(wsManager, payload, 'API/extend');

  const resp = await wsManager.sendRequest('api_call', {
    url: '/api/generate/v2/',
    method: 'POST',
    body: payload,
  });

  if (resp.error) return json({ error: resp.error.message }, 500);

  const data = resp.result!.data;
  if (body.wait_audio && data.clips) {
    const clipIds = data.clips.map((c: any) => c.id);
    return json(await pollForCompletion(wsManager, clipIds));
  }
  if (data.clips) {
    return json(data.clips.map(normalizeClip));
  }
  return json(data);
}

/** Proxy lyrics generation with polling */
async function proxyLyrics(wsManager: WebSocketManager, body: any): Promise<Response> {
  const initResp = await wsManager.sendRequest('api_call', {
    url: '/api/generate/lyrics/',
    method: 'POST',
    body: { prompt: body.prompt },
  });

  if (initResp.error) return json({ error: initResp.error.message }, 500);

  const generateId = initResp.result!.data.id;

  // Poll for completion
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollResp = await wsManager.sendRequest('api_call', {
      url: `/api/generate/lyrics/${generateId}`,
      method: 'GET',
    });

    if (pollResp.error) continue;
    if (pollResp.result!.data.status === 'complete') {
      return json(pollResp.result!.data);
    }
  }

  return json({ error: 'Lyrics generation timed out' }, 504);
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
