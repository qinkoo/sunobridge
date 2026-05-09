import { NextResponse, NextRequest } from "next/server";
import { cookies } from 'next/headers';
import { DEFAULT_MODEL, sunoApi } from "@/lib/SunoApi";
import { corsHeaders } from "@/lib/utils";
import { detectSfx, sfxBlockResponse } from "@/lib/sfx-detector";

export const maxDuration = 60; // allow longer timeout for wait_audio == true
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { prompt, tags, title, make_instrumental, model, wait_audio, negative_tags, allow_sfx } = body;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return new NextResponse(JSON.stringify({ error: 'Prompt is required and must be a non-empty string' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // SFX check (also scan tags for sfx-related terms)
      const sfx = detectSfx(prompt, tags);
      if (sfx.isSfx && !allow_sfx) {
        return sfxBlockResponse(corsHeaders);
      }

      const audioInfo = await (await sunoApi((await cookies()).toString())).custom_generate(
        prompt, tags, title,
        Boolean(make_instrumental),
        model || DEFAULT_MODEL,
        Boolean(wait_audio),
        negative_tags
      );
      return new NextResponse(JSON.stringify(audioInfo), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error: any) {
      console.error('Error generating custom audio:', error);
      return new NextResponse(JSON.stringify({ error: error.response?.data?.detail || error.toString() }), {
        status: error.response?.status || 500,
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
