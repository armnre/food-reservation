'use client';

import React from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

const PALETTE = ['#3A2D7D', '#66469A', '#F08020', '#B8A3DB', '#D66815', '#9679C9', '#743716'];

export function DistributionPie({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--color-foreground-muted)]">
        داده‌ای برای نمایش وجود ندارد
      </div>
    );
  }
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={54}
            outerRadius={92}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              direction: 'rtl',
              fontFamily: 'Vazirmatn, sans-serif',
              borderRadius: 12,
              border: '1px solid rgba(58,45,125,0.14)',
              fontSize: 12,
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={44}
            formatter={(value: string) => (
              <span style={{ fontFamily: 'Vazirmatn, sans-serif', fontSize: 11, color: '#6b5e82' }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DistributionBar({ data, color = '#3A2D7D' }: { data: { name: string; value: number }[]; color?: string }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--color-foreground-muted)]">
        داده‌ای برای نمایش وجود ندارد
      </div>
    );
  }
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(58,45,125,0.10)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontFamily: 'Vazirmatn, sans-serif', fontSize: 11, fill: '#6b5e82' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontFamily: 'Vazirmatn, sans-serif', fontSize: 11, fill: '#6b5e82' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            orientation="right"
          />
          <Tooltip
            cursor={{ fill: 'rgba(58,45,125,0.06)' }}
            contentStyle={{
              direction: 'rtl',
              fontFamily: 'Vazirmatn, sans-serif',
              borderRadius: 12,
              border: '1px solid rgba(58,45,125,0.14)',
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
