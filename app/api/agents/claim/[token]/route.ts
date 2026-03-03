import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const agent = await prisma.agent.findUnique({ where: { claimToken: token } });
    if (!agent) {
      return errorResponse('Invalid claim token', 'This claim link is not valid', 404);
    }

    return successResponse({
      agent: {
        name: agent.name,
        description: agent.description,
        claimStatus: agent.claimStatus,
      },
    });
  } catch (error: any) {
    return errorResponse('Failed to verify token', error.message, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const agent = await prisma.agent.findUnique({ where: { claimToken: token } });
    if (!agent) {
      return errorResponse('Invalid claim token', 'This claim link is not valid', 404);
    }

    if (agent.claimStatus === 'claimed') {
      return successResponse({
        message: 'Agent already claimed',
        agent: { name: agent.name, claimStatus: 'claimed' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        claimStatus: 'claimed',
        ownerEmail: body.email || null,
        lastActive: new Date(),
      },
    });

    return successResponse({
      message: 'Agent claimed successfully!',
      agent: {
        name: updated.name,
        claimStatus: 'claimed',
        ownerEmail: updated.ownerEmail,
      },
    });
  } catch (error: any) {
    return errorResponse('Failed to claim agent', error.message, 500);
  }
}
