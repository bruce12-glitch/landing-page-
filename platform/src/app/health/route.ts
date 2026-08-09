import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'UP',
      buildSha: process.env.BUILD_SHA || '019fe739-slice-1',
      timestamp: new Date().toISOString(),
      service: 'vendorchain-platform',
      version: '0.1.0',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
