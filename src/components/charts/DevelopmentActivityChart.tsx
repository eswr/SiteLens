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
import type { DevelopmentActivitySummary } from '../../types/analysis';
import ChartEmpty from './ChartEmpty';

/** Horizontal bar chart of development-activity counts by status. */
export default function DevelopmentActivityChart({
  data,
}: {
  data: DevelopmentActivitySummary[];
}) {
  if (data.length === 0) {
    return <ChartEmpty message="No development activity in this area." />;
  }

  const chartData = data.map((item) => ({
    name: item.status,
    count: item.count,
  }));

  return (
    <Box sx={{ height: Math.max(120, chartData.length * 40 + 40) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11 }}
            width={96}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
          <Bar
            dataKey="count"
            fill={LAYER_COLORS.developmentActivity}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
