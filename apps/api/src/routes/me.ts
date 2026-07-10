import type { FastifyInstance } from 'fastify';
import type {
  ApiEnvelope,
  BillingContext,
  CapabilityFlags,
  DemoUser,
} from '@sitelens/shared';
import { resolveBilling } from '../billing/billingService';

interface MeResponse {
  user: DemoUser | null;
  capabilities: CapabilityFlags;
  billing: {
    plan: BillingContext['plan'];
    subscription: BillingContext['subscription'];
    features: BillingContext['features'];
  };
}

/** `GET /api/me` — current demo user, capabilities, and billing context. */
export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', async (request) => {
    const { user, billing, capabilities } = await resolveBilling(request);
    const body: ApiEnvelope<MeResponse> = {
      data: {
        user,
        capabilities,
        billing: {
          plan: billing.plan,
          subscription: billing.subscription,
          features: billing.features,
        },
      },
      meta: {
        requestId: request.id,
        access: {
          role: user?.role,
          plan: billing.plan.id,
        },
      },
    };
    return body;
  });
}
