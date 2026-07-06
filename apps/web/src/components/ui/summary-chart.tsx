"use client";

import { Card as TremorCard, Metric, Text } from "@tremor/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export type SummaryChartDatum = {
  label: string;
  value: number;
};

export function SummaryBarChart({
  data,
  title,
}: {
  data: SummaryChartDatum[];
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">{title}</h2>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} />
              <YAxis allowDecimals={false} tickLine={false} width={36} />
              <Tooltip cursor={{ fill: "rgba(148, 163, 184, 0.14)" }} />
              <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function TremorMetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <TremorCard
      className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
      decoration="top"
      decorationColor="blue"
    >
      <Text>{label}</Text>
      <Metric>{value}</Metric>
    </TremorCard>
  );
}
