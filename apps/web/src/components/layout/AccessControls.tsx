import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import PersonIcon from '@mui/icons-material/Person';
import { isApiConfigured } from '../../api/client';
import { useAuthStore, type AuthMode } from '../../store/authStore';
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

  let label: string;
  let color: 'default' | 'primary' | 'success' = 'default';
  if (authMode === 'local') {
    label = 'Local demo mode';
  } else if (!user) {
    label = 'Anonymous · limited';
  } else {
    label = `${user.name} · ${PLAN_LABEL[user.plan]}`;
    color = user.plan === 'free' ? 'default' : 'success';
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

const SWITCHER_OPTIONS: { value: AuthMode; label: string }[] = [
  { value: 'anonymous', label: 'Anonymous' },
  { value: 'viewer', label: 'Viewer · Free' },
  { value: 'planner', label: 'Planner · Pro' },
  { value: 'admin', label: 'Admin · Enterprise' },
];

/** Demo access switcher (for the sidebar footer). */
export function DemoAccessSwitcher() {
  const authMode = useAuthStore((state) => state.authMode);
  const setMode = useAuthStore((state) => state.setMode);

  if (!isApiConfigured()) {
    return (
      <Box>
        <Typography variant="overline" sx={{ display: 'block' }}>
          Demo access
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Local demo mode — set <code>VITE_API_BASE_URL</code> to demo
          role/entitlement behavior against the API.
        </Typography>
      </Box>
    );
  }

  const value = authMode === 'local' ? 'anonymous' : authMode;

  return (
    <TextField
      select
      size="small"
      fullWidth
      label="Demo access"
      value={value}
      onChange={(event) => {
        void setMode(event.target.value as AuthMode);
      }}
    >
      {SWITCHER_OPTIONS.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
