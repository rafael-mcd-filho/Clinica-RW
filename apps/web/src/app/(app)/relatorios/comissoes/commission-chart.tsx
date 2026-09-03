"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartSeries } from "@/lib/colors";

export type CommissionPoint = {
  month: string;
  Receita: number;
  Comissão: number;
};

/**
 * Receita e comissão no mesmo eixo.
 *
 * As duas séries são reais em BRL, então dividem a escala — dois eixos y
 * fariam a comissão parecer do tamanho da receita. Com um eixo só, a distância
 * entre as linhas é a informação: é a margem que sobra depois do repasse.
 */
export function CommissionChart({ data }: { data: CommissionPoint[] }) {
  const [revenueColor, commissionColor] = chartSeries;

  return (
    <div className="h-72">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data} margin={{ left: 8, right: 16, top: 8 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={72}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(value: number) => compactCurrency(value)}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            formatter={(value, name) => [currency(Number(value)), String(name)]}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
              fontSize: 13,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 13, color: "var(--muted-foreground)" }}
          />
          <Line
            type="monotone"
            dataKey="Receita"
            stroke={revenueColor}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: revenueColor }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
          />
          <Line
            type="monotone"
            dataKey="Comissão"
            stroke={commissionColor}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: commissionColor }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 1,
  }).format(value);
}
