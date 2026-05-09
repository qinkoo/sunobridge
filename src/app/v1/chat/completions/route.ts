import { NextResponse, NextRequest } from "next/server";
import { cookies } from 'next/headers'
import { DEFAULT_MODEL, sunoApi } from "@/lib/SunoApi";
import { corsHeaders } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * desc
 *
 */
export async function POST(req: NextRequest) {
  try {

    const body = await req.json();

    const { messages, model: userModel } = body;

    if (!messages || !Array.isArray(messages)) {
      return new NextResponse(JSON.stringify({ error: 'Messages array is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    let userMessage = null;
    for (let message of messages) {
      if (message.role == 'user') {
        userMessage = message;
      }
    }

    if (!userMessage) {
      return new NextResponse(JSON.stringify({ error: 'Prompt message is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    const model = userModel || DEFAULT_MODEL;
    const audioInfo = await (await sunoApi((await cookies()).toString())).generate(userMessage.content, true, model, true);

    const audio = audioInfo[0]
    const data = `## Song Title: ${audio.title}\n![Song Cover](${audio.image_url})\n### Lyrics:\n${audio.lyric}\n### Listen to the song: ${audio.audio_url}`

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        ...corsHeaders
      }
    });
  } catch (error: any) {
    const detail = error?.response?.data;
    console.error('Error generating audio:', detail ? JSON.stringify(detail) : String(error));
    return new NextResponse(JSON.stringify({ error: 'Internal server error: ' + (detail?.detail || String(error)) }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
}