import type { FastifyInstance } from 'fastify';
import type { ApiEnvelope, CapabilityFlags, DemoUser } from '@sitelens/shared';
import { getCapabilities } from '../auth/capabilities';

interface MeResponse {
  user: DemoUser | null;
  capabilities: CapabilityFlags;
}

/** `GET /api/me` — current demo user (or anonymous) and their capabilities. */
export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', async (request) => {
    const user = request.auth?.user ?? null;
    const capabilities = getCapabilities(user);
    const body: ApiEnvelope<MeResponse> = {
      data: { user, capabilities },
      meta: {
        requestId: request.id,
        access: user
          ? { role: user.role, plan: user.plan }
          : undefined,
      },
    };
    return body;
  });
}
