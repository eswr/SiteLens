import type { DemoUser } from '@sitelens/shared';

/**
 * Portfolio demo API keys → users. These are intentionally obvious,
 * non-secret demo credentials. **Production would use OAuth/SSO, JWT/session
 * cookies, and Passport-style strategies — never hard-coded keys.**
 */
export const demoApiKeys: Record<string, DemoUser> = {
  'demo-viewer-key': {
    id: 'user_viewer',
    name: 'Demo Viewer',
    role: 'viewer',
    plan: 'free',
  },
  'demo-planner-key': {
    id: 'user_planner',
    name: 'Demo Planner',
    role: 'planner',
    plan: 'pro',
  },
  'demo-admin-key': {
    id: 'user_admin',
    name: 'Demo Admin',
    role: 'admin',
    plan: 'enterprise',
  },
};

/** Resolve a demo user for an API key, or `null` if the key is unknown. */
export function getUserForApiKey(key: string | undefined): DemoUser | null {
  if (!key) {
    return null;
  }
  return demoApiKeys[key] ?? null;
}
