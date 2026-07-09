import Box from '@mui/material/Box';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LAYER_COLORS } from '../../data/layers';
import type { ZoningBreakdownItem } from '../../types/analysis';
import ChartEmpty from './ChartEmpty';

/** Bar chart of intersecting zoning overlays by zone code. */
export default function ZoningBreakdownChart({
  data,
}: {
  data: ZoningBreakdownItem[];
}) {
  if (data.length === 0) {
    return <ChartEmpty message="No zoning overlays in this area." />;
  }

  const chartData = data.map((zone) => ({
    name: zone.zoneCode,
    label: `${zone.zoneCode} · ${zone.zoneName}`,
    count: zone.count,
  }));

  return (
    <Box sx={{ height: 190 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
          <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
          <Bar
            dataKey="count"
            fill={LAYER_COLORS.zoning}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
