import { NextResponse, NextRequest } from "next/server";
import { cookies } from 'next/headers'
import { sunoApi } from "@/lib/SunoApi";
import { corsHeaders } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url);
      const clipId = url.searchParams.get('id');
      if (clipId == null) {
        return new NextResponse(JSON.stringify({ error: 'Missing parameter id' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      const audioInfo = await (await sunoApi((await cookies()).toString())).getClip(clipId);

      return new NextResponse(JSON.stringify(audioInfo), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error: any) {
      const detail = error?.response?.data;
      console.error('Error fetching audio:', detail ? JSON.stringify(detail) : String(error));
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
