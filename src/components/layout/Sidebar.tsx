import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LayersIcon from '@mui/icons-material/Layers';
import SearchIcon from '@mui/icons-material/Search';
import InsightsIcon from '@mui/icons-material/Insights';

interface SidebarSectionProps {
  icon: ReactNode;
  title: string;
  description: string;
}

function SidebarSection({ icon, title, description }: SidebarSectionProps) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Box sx={{ display: 'flex', color: 'primary.main' }}>{icon}</Box>
        <Typography variant="subtitle2">{title}</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </Box>
  );
}

/** Left navigation rail with placeholder tool sections for later steps. */
export default function Sidebar() {
  return (
    <Box
      component="nav"
      aria-label="Tools"
      sx={{
        width: 260,
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        backgroundColor: 'background.default',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="overline">Tools</Typography>
      <SidebarSection
        icon={<LayersIcon fontSize="small" />}
        title="Layers"
        description="Toggle planning and parcel layers. Coming in a later step."
      />
      <SidebarSection
        icon={<SearchIcon fontSize="small" />}
        title="Search"
        description="Find addresses, parcels, and precincts on the map."
      />
      <SidebarSection
        icon={<InsightsIcon fontSize="small" />}
        title="Analysis"
        description="Run spatial analysis and view generated insights."
      />
    </Box>
  );
}
