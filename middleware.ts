import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Compatibility shim for clients that accidentally build "/api/api/..." URLs.
export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = url.pathname
    // Collapse repeated "/api" prefixes from malformed client URL joins.
    .replace(/^\/api(?:\/api)+\//, '/api/')
    .replace(/^\/api(?:\/api)+$/, '/api');
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/api/api/:path*'],
};
