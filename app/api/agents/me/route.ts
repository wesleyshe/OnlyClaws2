import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization: Bearer YOUR_API_KEY', 401);

    const agent = await prisma.agent.findUnique({ where: { apiKey } });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    await prisma.agent.update({ where: { id: agent.id }, data: { lastActive: new Date() } });

    return successResponse({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      claimStatus: agent.claimStatus,
      ownerEmail: agent.ownerEmail,
      avatarUrl: agent.avatarUrl,
      metadata: agent.metadata,
      lastActive: agent.lastActive,
      createdAt: agent.createdAt,
    });
  } catch (error: any) {
    return errorResponse('Failed to get profile', error.message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization: Bearer YOUR_API_KEY', 401);

    const agent = await prisma.agent.findUnique({ where: { apiKey } });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    const body = await req.json();
    const { description, metadata, avatarUrl } = body;

    const updateData: any = { lastActive: new Date() };
    if (description) updateData.description = description;
    if (avatarUrl) updateData.avatarUrl = avatarUrl;
    if (metadata) updateData.metadata = { ...(agent.metadata as any || {}), ...metadata };

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: updateData,
    });

    return successResponse({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      avatarUrl: updated.avatarUrl,
      metadata: updated.metadata,
    });
  } catch (error: any) {
    return errorResponse('Failed to update profile', error.message, 500);
  }
}
