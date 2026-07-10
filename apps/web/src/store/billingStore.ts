import { create } from 'zustand';
import { isApiConfigured } from '../api/client';
import { getCurrentBilling, getPlans, setDemoPlan } from '../api/billingApi';
import type { BillingCurrent } from '../api/billingApi';
import type { BillingPlanSummary, PlanTier } from '../api/meApi';
import { refreshAuth } from './authStore';

interface BillingState {
  plans: BillingPlanSummary[];
  currentBilling: BillingCurrent | null;
  isLoading: boolean;
  error: string | null;
  /** Load the plan catalog + current billing context. */
  initialize: () => Promise<void>;
  /** Switch the demo plan, then refresh billing + auth (capabilities). */
  setDemoPlan: (plan: PlanTier) => Promise<void>;
}

export const useBillingStore = create<BillingState>((set) => ({
  plans: [],
  currentBilling: null,
  isLoading: false,
  error: null,

  initialize: async () => {
    if (!isApiConfigured()) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const [plans, currentBilling] = await Promise.all([
        getPlans(),
        getCurrentBilling(),
      ]);
      set({ plans, currentBilling, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error:
          error instanceof Error ? error.message : 'Failed to load billing.',
      });
    }
  },

  setDemoPlan: async (plan) => {
    if (!isApiConfigured()) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const currentBilling = await setDemoPlan(plan);
      set({ currentBilling, isLoading: false });
      // Refresh /api/me so capabilities + header plan chip update.
      await refreshAuth();
    } catch (error) {
      set({
        isLoading: false,
        error:
          error instanceof Error ? error.message : 'Failed to change plan.',
      });
    }
  },
}));
