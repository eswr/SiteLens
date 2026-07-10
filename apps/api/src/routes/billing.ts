import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  BillingContext,
  BillingPlan,
  CapabilityFlags,
} from '@sitelens/shared';
import { PLAN_LIST, isBillingPlanId } from '@sitelens/shared';
import { loadConfig } from '../config';
import { requireAuthenticated } from '../auth/requireCapability';
import { resolveBilling } from '../billing/billingService';
import {
  applyStripeSubscriptionEvent,
  setDemoPlanForUser,
} from '../billing/billingRepository';

const demoPlanBody = Type.Object({
  plan: Type.Union([
    Type.Literal('free'),
    Type.Literal('pro'),
    Type.Literal('enterprise'),
  ]),
});
type DemoPlanBody = Static<typeof demoPlanBody>;

interface BillingCurrentResponse {
  plan: BillingPlan;
  subscription: BillingContext['subscription'];
  features: BillingContext['features'];
  capabilities: CapabilityFlags;
}

function billingResponse(
  billing: BillingContext,
  capabilities: CapabilityFlags,
): BillingCurrentResponse {
  return {
    plan: billing.plan,
    subscription: billing.subscription,
    features: billing.features,
    capabilities,
  };
}

/** Verify a Stripe-style `t=<ts>,v1=<hmac>` signature over `${ts}.${payload}`. */
function verifySignature(
  payload: string,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header) {
    return false;
  }
  const parts = Object.fromEntries(
    header.split(',').map((part) => part.split('=') as [string, string]),
  );
  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) {
    return false;
  }
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface StripeEvent {
  type?: string;
  data?: { object?: Record<string, unknown> };
}

async function handleStripeEvent(event: StripeEvent): Promise<void> {
  const object = event.data?.object ?? {};
  const accountId =
    typeof object.account_id === 'string' ? object.account_id : undefined;
  if (!accountId) {
    return;
  }
  const plan = isBillingPlanId(object.plan) ? object.plan : undefined;
  const stripeSubscriptionId =
    typeof object.id === 'string' ? object.id : undefined;

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await applyStripeSubscriptionEvent({
        accountId,
        plan,
        status: 'active',
        stripeSubscriptionId,
      });
      break;
    case 'customer.subscription.deleted':
      await applyStripeSubscriptionEvent({
        accountId,
        plan: 'free',
        status: 'canceled',
        stripeSubscriptionId,
      });
      break;
    case 'invoice.payment_failed':
      await applyStripeSubscriptionEvent({
        accountId,
        plan,
        status: 'past_due',
        stripeSubscriptionId,
      });
      break;
    default:
      break;
  }
}

function forbidden(reply: FastifyReply, message: string): ApiErrorEnvelope {
  reply.code(403);
  return { error: { code: 'FORBIDDEN', message } };
}

/** Billing routes: plan catalog, current context, demo plan switch, webhook. */
export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/billing/plans', async (request) => {
    const body: ApiEnvelope<BillingPlan[]> = {
      data: PLAN_LIST,
      meta: { requestId: request.id },
    };
    return body;
  });

  app.get('/billing/current', async (request) => {
    const { user, billing, capabilities } = await resolveBilling(request);
    const body: ApiEnvelope<BillingCurrentResponse> = {
      data: billingResponse(billing, capabilities),
      meta: { requestId: request.id, access: { role: user?.role, plan: billing.plan.id } },
    };
    return body;
  });

  app.post<{ Body: DemoPlanBody }>(
    '/billing/demo-plan',
    { schema: { body: demoPlanBody } },
    async (request, reply) => {
      requireAuthenticated(request);
      const config = loadConfig();
      if (config.isProduction && !config.enableDemoBilling) {
        return forbidden(
          reply,
          'Demo plan switching is disabled in production. Use Stripe Checkout.',
        );
      }
      const user = request.auth.user;
      if (!user) {
        return forbidden(reply, 'Authentication is required.');
      }

      const billing = await setDemoPlanForUser(user.id, request.body.plan);
      const { capabilities } = await resolveBilling(request);
      const body: ApiEnvelope<BillingCurrentResponse> = {
        data: billingResponse(billing, capabilities),
        meta: { requestId: request.id, access: { role: user.role, plan: billing.plan.id } },
      };
      return body;
    },
  );

  app.post('/billing/webhook', async (request, reply) => {
    const config = loadConfig();
    const payload = JSON.stringify(request.body ?? {});
    const signature = request.headers['stripe-signature'];
    const sigHeader = Array.isArray(signature) ? signature[0] : signature;

    if (config.stripeWebhookSecret) {
      // Production-style: require a valid signature.
      if (!verifySignature(payload, sigHeader, config.stripeWebhookSecret)) {
        reply.code(400);
        const body: ApiErrorEnvelope = {
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Invalid Stripe webhook signature.',
          },
        };
        return body;
      }
    } else if (config.isProduction) {
      // No secret in production → refuse unsigned webhooks.
      return forbidden(
        reply,
        'Webhook requires STRIPE_WEBHOOK_SECRET in production.',
      );
    }
    // Non-production without a secret accepts demo payloads directly.

    const event = (request.body ?? {}) as StripeEvent;
    try {
      await handleStripeEvent(event);
    } catch (error) {
      // Never fail the webhook because a demo DB write failed.
      request.log.warn(error);
    }
    return { data: { received: true, type: event.type ?? null } };
  });
}
