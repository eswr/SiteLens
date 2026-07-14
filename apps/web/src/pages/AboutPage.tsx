import type { ReactNode } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PublicIcon from '@mui/icons-material/Public';
import { Link as RouterLink } from 'react-router-dom';

const STACK_ITEMS = [
  'React',
  'MUI',
  'MapLibre',
  'Fastify',
  'PostGIS',
  'Redis',
  'pg-boss',
  'TanStack Query',
] as const;

const ARCHITECTURE_HIGHLIGHTS = [
  'Dual mode: full-stack API + PostGIS when configured, or frontend-only demo with bundled Sydney Demo GeoJSON and local Turf analysis.',
  'Worldwide place search via a Nominatim/OSM proxy — the browser never calls Nominatim directly.',
  'On-demand external planning contexts: Overpass fetch → async build jobs (pg-boss worker) → PostGIS cache, scoped to the selected place.',
  'Redis caching for place search, spatial analysis, and planning summaries, with entitlement-scoped keys.',
  'Entitlement-gated spatial analysis and deterministic, source-transparent planning summaries.',
] as const;

/** Portfolio About page for SiteLens. */
export default function AboutPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.default',
      }}
    >
      <AppBar
        position="sticky"
        elevation={0}
        color="default"
        sx={{
          backgroundColor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 2,
              color: 'primary.contrastText',
              backgroundColor: 'primary.main',
            }}
          >
            <PublicIcon fontSize="small" />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
            <Typography variant="h6" component="p" sx={{ lineHeight: 1.2 }}>
              SiteLens
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ lineHeight: 1.2 }}
            >
              About
            </Typography>
          </Box>
          <Button
            component={RouterLink}
            to="/"
            variant="contained"
            startIcon={<ArrowBackIcon />}
          >
            Back to map
          </Button>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flex: 1, py: { xs: 3, md: 5 } }}>
        <Container maxWidth="md">
          <Stack spacing={4}>
            <Box>
              <Typography variant="h4" component="h1" gutterBottom>
                About SiteLens
              </Typography>
              <Typography color="text.secondary">
                A full-stack geospatial planning intelligence portfolio demo.
              </Typography>
            </Box>

            <Section title="What SiteLens is">
              <Typography>
                SiteLens is a geospatial planning intelligence platform that
                turns planning-context datasets into searchable map layers,
                spatial analysis, analytics dashboards, and source-transparent
                planning summaries. It ships as a public portfolio project that
                demonstrates end-to-end ownership of a map-centric product —
                frontend workflow, spatial backend, caching, entitlements, and
                async data pipelines.
              </Typography>
            </Section>

            <Section title="Problem">
              <Typography>
                Planning and property users need to understand place-based
                decisions quickly, but raw spatial datasets are difficult for
                non-technical users to interpret. Without an integrated product
                surface, layers, analysis, and narrative stay disconnected —
                and reviewers never see how evidence maps to conclusions.
              </Typography>
            </Section>

            <Section title="Solution">
              <Typography>
                SiteLens combines interactive MapLibre layers, feature search,
                area-of-interest drawing, PostGIS-backed spatial analysis,
                Recharts analytics, and a backend-owned deterministic planning
                summary. It includes a bundled Sydney Demo seed for offline and
                frontend-only use, and can build open-map-derived external
                contexts for any selected worldwide place through an Overpass
                pipeline — without claiming those layers are official zoning or
                cadastre.
              </Typography>
            </Section>

            <Section title="Stack">
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {STACK_ITEMS.map((item) => (
                  <Chip key={item} label={item} variant="outlined" />
                ))}
              </Box>
            </Section>

            <Section title="Architecture highlights">
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {ARCHITECTURE_HIGHLIGHTS.map((item) => (
                  <Typography
                    key={item}
                    component="li"
                    sx={{ mb: 1 }}
                  >
                    {item}
                  </Typography>
                ))}
              </Box>
            </Section>

            <Section title="Data disclaimer">
              <Typography color="text.secondary">
                External contexts are open-map-derived urban context layers —
                not official zoning, cadastre, or development-application data.
                The Sydney Demo context is synthetic portfolio seed data used as
                the default and offline fallback. Treat all outputs as
                demonstration evidence, not regulatory advice.
              </Typography>
            </Section>

            <Box sx={{ pt: 1, pb: 2 }}>
              <Button
                component={RouterLink}
                to="/"
                variant="contained"
                size="large"
                startIcon={<ArrowBackIcon />}
              >
                Back to map
              </Button>
            </Box>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box component="section">
      <Typography variant="h6" component="h2" gutterBottom>
        {title}
      </Typography>
      {children}
    </Box>
  );
}
