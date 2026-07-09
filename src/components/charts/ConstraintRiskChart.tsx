import Box from '@mui/material/Box';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ConstraintIntersection } from '../../types/analysis';
import ChartEmpty from './ChartEmpty';

/** Colors and severity order for known risk levels. */
const RISK_COLORS: Record<string, string> = {
  High: '#dc2626',
  Medium: '#d97706',
  Low: '#16a34a',
};
const RISK_ORDER = ['High', 'Medium', 'Low'];

/** Bar chart of intersecting constraints grouped by risk level. */
export default function ConstraintRiskChart({
  data,
}: {
  data: ConstraintIntersection[];
}) {
  if (data.length === 0) {
    return <ChartEmpty message="No intersecting constraints." />;
  }

  const counts = new Map<string, number>();
  for (const constraint of data) {
    counts.set(constraint.riskLevel, (counts.get(constraint.riskLevel) ?? 0) + 1);
  }
  const chartData = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      const ai = RISK_ORDER.indexOf(a.name);
      const bi = RISK_ORDER.indexOf(b.name);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

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
            tick={{ fontSize: 12 }}
            width={72}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {chartData.map((entry) => (
              <Cell
                key={entry.name}
                fill={RISK_COLORS[entry.name] ?? '#64748b'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
