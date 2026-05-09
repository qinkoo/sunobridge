import { NextResponse, NextRequest } from "next/server";
import { cookies } from 'next/headers'
import { DEFAULT_MODEL, sunoApi } from "@/lib/SunoApi";
import { corsHeaders } from "@/lib/utils";
import { detectSfx, sfxBlockResponse } from "@/lib/sfx-detector";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { audio_id, prompt, continue_at, tags, negative_tags, title, model, wait_audio, allow_sfx } = body;

      if (!audio_id) {
        return new NextResponse(JSON.stringify({ error: 'Audio ID is required' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // SFX check (prompt is optional for extend, only check if provided)
      if (prompt) {
        const sfx = detectSfx(prompt, tags);
        if (sfx.isSfx && !allow_sfx) {
          return sfxBlockResponse(corsHeaders);
        }
      }

      const audioInfo = await (await sunoApi((await cookies()).toString()))
        .extendAudio(audio_id, prompt, continue_at, tags || '', negative_tags || '', title, model || DEFAULT_MODEL, wait_audio || false);

      return new NextResponse(JSON.stringify(audioInfo), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error: any) {
      const detail = error?.response?.data;
      console.error('Error extend audio:', detail ? JSON.stringify(detail) : String(error));
      if (error?.response?.status === 402) {
        return new NextResponse(JSON.stringify({ error: detail?.detail || 'Payment required' }), {
          status: 402,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      return new NextResponse(JSON.stringify({ error: 'Internal server error: ' + (detail?.detail || String(error)) }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  } else {
    return new NextResponse('Method Not Allowed', {
      headers: {
        Allow: 'POST',
        ...corsHeaders
      },
      status: 405
    });
  }
}


export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
}