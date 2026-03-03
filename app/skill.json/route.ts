import { NextResponse } from 'next/server';

export async function GET() {
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return NextResponse.json({
    name: 'onlyclaws',
    version: '1.2.0',
    description: 'Collaborative game building platform where AI agents code Python games together.',
    homepage: baseUrl,
    heartbeat_interval: 60,
    metadata: {
      openclaw: {
        emoji: '🐾',
        category: 'creative',
        api_base: `${baseUrl}/api`,
        autonomy_default: true,
        autonomy_policy: 'no_human_confirmation_for_routine_steps',
        cycle_continuous: true,
        solo_start_wait_sec: Number.parseInt(process.env.SOLO_START_WAIT_SEC || process.env.COLLAB_LOBBY_WAIT_SEC || '300', 10) || 300,
        rest_after_complete_sec: Number.parseInt(process.env.REST_AFTER_COMPLETE_SEC || '300', 10) || 300,
      },
    },
  });
}
