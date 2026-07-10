import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import PersonIcon from '@mui/icons-material/Person';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { isApiConfigured } from '../../api/client';
import { useAuthStore, type AuthMode } from '../../store/authStore';
import { useBillingStore } from '../../store/billingStore';
import type { PlanTier } from '../../api/meApi';

const PLAN_LABEL: Record<PlanTier, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

/** Compact chip describing the current demo access state (for the header). */
export function AccessStatusChip() {
  const authMode = useAuthStore((state) => state.authMode);
  const user = useAuthStore((state) => state.user);
  const plan = useAuthStore((state) => state.plan);

  let label: string;
  let color: 'default' | 'primary' | 'success' = 'default';
  if (authMode === 'local') {
    label = 'Local demo mode';
  } else if (!user) {
    label = `Anonymous · ${PLAN_LABEL[plan ?? 'free']}`;
  } else {
    const effectivePlan = plan ?? user.plan;
    label = `${user.name} · ${PLAN_LABEL[effectivePlan]}`;
    color = effectivePlan === 'free' ? 'default' : 'success';
  }

  return (
    <Chip
      icon={<PersonIcon />}
      size="small"
      variant="outlined"
      color={color === 'default' ? undefined : color}
      label={label}
      sx={{ fontWeight: 600 }}
    />
  );
}

const ROLE_OPTIONS: { value: AuthMode; label: string }[] = [
  { value: 'anonymous', label: 'Anonymous' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'planner', label: 'Planner' },
  { value: 'admin', label: 'Admin' },
];

const PLAN_OPTIONS: PlanTier[] = ['free', 'pro', 'enterprise'];

/** Demo identity + plan switchers (for the sidebar footer). */
export function DemoAccessSwitcher() {
  const authMode = useAuthStore((state) => state.authMode);
  const setMode = useAuthStore((state) => state.setMode);
  const user = useAuthStore((state) => state.user);
  const plan = useAuthStore((state) => state.plan);
  const setDemoPlan = useBillingStore((state) => state.setDemoPlan);

  if (!isApiConfigured()) {
    return (
      <Box>
        <Typography variant="overline" sx={{ display: 'block' }}>
          Demo access
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Local demo mode — set <code>VITE_API_BASE_URL</code> to demo
          role/plan entitlement behavior against the API.
        </Typography>
      </Box>
    );
  }

  const roleValue = authMode === 'local' ? 'anonymous' : authMode;

  return (
    <Stack spacing={1}>
      <Typography variant="overline">Demo access</Typography>
      <TextField
        select
        size="small"
        fullWidth
        label="Identity"
        value={roleValue}
        onChange={(event) => {
          void setMode(event.target.value as AuthMode);
        }}
      >
        {ROLE_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        fullWidth
        label="Plan"
        value={plan ?? 'free'}
        disabled={!user}
        helperText={!user ? 'Sign in as a demo user to change plan' : undefined}
        onChange={(event) => {
          void setDemoPlan(event.target.value as PlanTier);
        }}
      >
        {PLAN_OPTIONS.map((option) => (
          <MenuItem key={option} value={option}>
            {PLAN_LABEL[option]}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}

/** Plan badge for compact display (e.g. near analysis controls). */
export function PlanBadge() {
  const plan = useAuthStore((state) => state.plan);
  const authMode = useAuthStore((state) => state.authMode);
  if (authMode === 'local' || !plan) {
    return null;
  }
  return (
    <Chip
      icon={<WorkspacePremiumIcon />}
      size="small"
      variant="outlined"
      color={plan === 'free' ? undefined : 'success'}
      label={PLAN_LABEL[plan]}
      sx={{ fontWeight: 600 }}
    />
  );
}
