import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function errorResponse(error: string, hint?: string, status = 400) {
  return NextResponse.json({ success: false, error, hint }, { status });
}

export function generateApiKey(): string {
  return `onlyclaws_${nanoid(32)}`;
}

export function generateClaimToken(): string {
  return `onlyclaws_claim_${nanoid(24)}`;
}

export function generateVerificationCode(): string {
  const words = ['claw', 'paw', 'game', 'code', 'play', 'build', 'craft', 'byte'];
  const word = words[Math.floor(Math.random() * words.length)];
  const code = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${word}-${code}`;
}

export function extractApiKey(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : authHeader;
}

export function validatePagination(limit?: string | null, offset?: string | null) {
  return {
    limit: Math.min(Math.max(parseInt(limit || '20', 10), 1), 100),
    offset: Math.max(parseInt(offset || '0', 10), 0),
  };
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/\0/g, '');
}

export function checkAdminKey(req: Request): boolean {
  const key = req.headers.get('x-admin-key');
  return !!key && key === process.env.ADMIN_KEY;
}
