import { create } from 'zustand';
import { getDemoApiKey, isApiConfigured, setDemoApiKey } from '../api/client';
import { fetchMe } from '../api/meApi';
import type { CapabilityFlags, DemoUser } from '../api/meApi';

export type AuthMode =
  | 'local'
  | 'anonymous'
  | 'viewer'
  | 'planner'
  | 'admin';

/** Local-mode capabilities: full client-side demo behavior. */
const LOCAL_CAPABILITIES: CapabilityFlags = {
  canReadLayers: true,
  canReadParcels: true,
  canRunAnalysis: true,
  canGenerateSummary: true,
  canIngestData: false,
  canViewAllLayers: true,
};

/** Demo key → switcher option value. */
export const DEMO_KEYS: Record<Exclude<AuthMode, 'local'>, string> = {
  anonymous: '',
  viewer: 'demo-viewer-key',
  planner: 'demo-planner-key',
  admin: 'demo-admin-key',
};

function modeForUser(user: DemoUser | null): AuthMode {
  return user ? user.role : 'anonymous';
}

interface AuthState {
  user: DemoUser | null;
  capabilities: CapabilityFlags;
  isLoading: boolean;
  error: string | null;
  authMode: AuthMode;
  /** Load `/api/me` (or local defaults when no API is configured). */
  initialize: () => Promise<void>;
  /** Switch demo access mode: update the API key and refetch `/api/me`. */
  setMode: (mode: AuthMode) => Promise<void>;
}

async function refresh(
  set: (partial: Partial<AuthState>) => void,
): Promise<void> {
  if (!isApiConfigured()) {
    set({
      user: null,
      capabilities: LOCAL_CAPABILITIES,
      authMode: 'local',
      isLoading: false,
      error: null,
    });
    return;
  }
  set({ isLoading: true, error: null });
  try {
    const me = await fetchMe();
    set({
      user: me.user,
      capabilities: me.capabilities,
      authMode: modeForUser(me.user),
      isLoading: false,
      error: null,
    });
  } catch (error) {
    set({
      isLoading: false,
      error: error instanceof Error ? error.message : 'Failed to load access.',
    });
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  capabilities: LOCAL_CAPABILITIES,
  isLoading: false,
  error: null,
  authMode: isApiConfigured() ? 'anonymous' : 'local',

  initialize: () => refresh(set),

  setMode: async (mode) => {
    if (mode === 'local' || !isApiConfigured()) {
      // No API configured: local mode only.
      set({
        user: null,
        capabilities: LOCAL_CAPABILITIES,
        authMode: 'local',
      });
      return;
    }
    setDemoApiKey(DEMO_KEYS[mode]);
    await refresh(set);
  },
}));

/** The current demo mode inferred from the stored key (before /api/me loads). */
export function currentModeFromKey(): AuthMode {
  if (!isApiConfigured()) {
    return 'local';
  }
  const key = getDemoApiKey();
  const match = (Object.entries(DEMO_KEYS) as [AuthMode, string][]).find(
    ([, value]) => value === key,
  );
  return match ? match[0] : 'anonymous';
}
