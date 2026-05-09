import { NextResponse, NextRequest } from "next/server";
import { cookies } from 'next/headers'
import { sunoApi } from "@/lib/SunoApi";
import { corsHeaders } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url);
      const song_id = url.searchParams.get('song_id');

      if (!song_id) {
        return new NextResponse(JSON.stringify({ error: 'Song ID is required' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      const lyricAlignment = await (await sunoApi((await cookies()).toString())).getLyricAlignment(song_id);


      return new NextResponse(JSON.stringify(lyricAlignment), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error: any) {
      const detail = error?.response?.data;
      console.error('Error fetching lyric alignment:', detail ? JSON.stringify(detail) : String(error));
      if (error?.response?.status === 402) {
        return new NextResponse(JSON.stringify({ error: detail?.detail || 'Payment required' }), {
          status: 402,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      return new NextResponse(JSON.stringify({ error: 'Internal server error: ' + (detail?.detail || 'An unexpected error occurred') }), {
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
        Allow: 'GET',
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