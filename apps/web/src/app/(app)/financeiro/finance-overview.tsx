"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bank,
  CreditCard,
  CurrencyCircleDollar,
  Money,
  Receipt as ReceiptText,
  TrendDown,
  TrendUp,
  Wallet,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { chartSeries } from "@/lib/colors";
import { cn } from "@/lib/utils";

export type FinanceOverviewBuckets = {
  overdue: number;
  dueToday: number;
  dueMonth: number;
  dueYear: number;
  settledMonth: number;
  settledYear: number;
};

export type FinanceOverview = {
  today: string;
  series: Array<{
    bucket: string;
    cashIn: number;
    cashOut: number;
    expectedIn: number;
    expectedOut: number;
  }>;
  receivable: FinanceOverviewBuckets;
  payable: FinanceOverviewBuckets;
  revenueCategories: Array<{ name: string; amount: number }>;
  expenseCategories: Array<{ name: string; amount: number }>;
  paymentMethods: Array<{
    name: string;
    methodType: string | null;
    amount: number;
  }>;
};

type Granularity = "day" | "week" | "month" | "year";

// Par divergente entrada/saída, cada polo com o tom realizado (forte) e o
// previsto (claro). Validado para daltonismo e reforçado pela posição — as
// entradas sobem e as saídas descem do eixo zero.
const flowColors = {
  cashIn: "#15803d",
  expectedIn: "#5eca86",
  cashOut: "#b91c1c",
  expectedOut: "#ef7d7d",
} as const;

const flowLegend = [
  { key: "cashIn", label: "Entradas" },
  { key: "expectedIn", label: "Entradas previstas" },
  { key: "cashOut", label: "Saídas" },
  { key: "expectedOut", label: "Saídas previstas" },
] as const;

const granularityOptions: Array<{ id: Granularity; label: string }> = [
  { id: "day", label: "Diária" },
  { id: "week", label: "Semanal" },
  { id: "month", label: "Mensal" },
  { id: "year", label: "Anual" },
];

const methodIcons: Record<string, PhosphorIcon> = {
  cash: Money,
  pix: Bank,
  credit_card: CreditCard,
  debit_card: CreditCard,
};

export function FinanceOverviewPanel({
  overview,
  periodRevenue,
  periodExpense,
  previousRevenue,
  previousExpense,
  openReceivable,
  openPayable,
  revenueLabel,
  expenseLabel,
  canViewCash,
  canViewPayables,
}: {
  overview: FinanceOverview;
  periodRevenue: number;
  periodExpense: number;
  previousRevenue: number;
  previousExpense: number;
  openReceivable: number;
  openPayable: number;
  revenueLabel: string;
  expenseLabel: string;
  canViewCash: boolean;
  canViewPayables: boolean;
}) {
  const receivedTotal = overview.paymentMethods.reduce(
    (total, method) => total + method.amount,
    0,
  );

  return (
    <div className="grid min-w-0 gap-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canViewCash ? (
          <KpiCard
            icon={CurrencyCircleDollar}
            label={revenueLabel}
            value={periodRevenue}
            delta={percentChange(periodRevenue, previousRevenue)}
            tone="success"
          />
        ) : null}
        {canViewPayables ? (
          <KpiCard
            icon={ReceiptText}
            label={expenseLabel}
            value={-periodExpense}
            delta={percentChange(periodExpense, previousExpense)}
            deltaInverted
            tone="destructive"
          />
        ) : null}
        {canViewCash ? (
          <KpiCard
            icon={Wallet}
            label="A receber"
            value={openReceivable}
            tone="neutral"
          />
        ) : null}
        {canViewPayables ? (
          <KpiCard
            icon={Wallet}
            label="A pagar"
            value={-openPayable}
            tone="neutral"
          />
        ) : null}
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <CashFlowCard series={overview.series} />
        <PaymentMethodsCard
          methods={overview.paymentMethods}
          total={receivedTotal}
        />
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-3">
        {canViewCash ? (
          <BucketsCard
            title="A receber"
            buckets={overview.receivable}
            tone="success"
            settledLabel="Recebidos"
          />
        ) : null}
        {canViewPayables ? (
          <BucketsCard
            title="A pagar"
            buckets={overview.payable}
            tone="destructive"
            settledLabel="Pagos"
          />
        ) : null}
        <CategoriesCard
          revenue={overview.revenueCategories}
          expense={overview.expenseCategories}
          canViewCash={canViewCash}
          canViewPayables={canViewPayables}
        />
      </section>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  deltaInverted = false,
  tone,
}: {
  icon: PhosphorIcon;
  label: string;
  value: number;
  delta?: number | null;
  deltaInverted?: boolean;
  tone: "success" | "destructive" | "neutral";
}) {
  const positiveDelta = delta !== null && delta !== undefined && delta >= 0;
  const goodDelta = deltaInverted ? !positiveDelta : positiveDelta;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-md",
                tone === "success"
                  ? "bg-success-muted text-success-foreground"
                  : tone === "destructive"
                    ? "bg-destructive-muted text-destructive-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4.5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">{label}</p>
          </div>
          {delta !== null && delta !== undefined ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium tabular-nums",
                goodDelta
                  ? "bg-success-muted text-success-foreground"
                  : "bg-destructive-muted text-destructive-foreground",
              )}
            >
              {positiveDelta ? (
                <TrendUp className="size-3" aria-hidden="true" />
              ) : (
                <TrendDown className="size-3" aria-hidden="true" />
              )}
              {formatPercent(delta)}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-display font-semibold tabular-nums">
          {formatCurrency(value)}
        </p>
      </CardContent>
    </Card>
  );
}

function CashFlowCard({ series }: { series: FinanceOverview["series"] }) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const data = useMemo(
    () => bucketSeries(series, granularity),
    [granularity, series],
  );
  const hasMovement = data.some(
    (point) =>
      point.cashIn || point.cashOut || point.expectedIn || point.expectedOut,
  );
  const net = data.reduce(
    (total, point) => total + point.cashIn - point.cashOut,
    0,
  );

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Fluxo de caixa</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Realizado no período:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatCurrency(net)}
            </span>
          </p>
        </div>
        <div
          className="flex rounded-md border border-border bg-muted p-0.5"
          role="group"
          aria-label="Agrupamento do fluxo de caixa"
        >
          {granularityOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={granularity === option.id}
              onClick={() => setGranularity(option.id)}
              className={cn(
                "rounded px-3 py-1 text-sm font-medium transition-colors duration-[var(--motion-fast)]",
                granularity === option.id
                  ? "bg-card text-foreground shadow-[var(--shadow-soft)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 p-4">
        {hasMovement ? (
          <>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={data}
                  margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
                  stackOffset="sign"
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={formatCompactCurrency}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={<CashFlowTooltip />}
                  />
                  <Bar
                    dataKey="cashIn"
                    stackId="flow"
                    fill={flowColors.cashIn}
                    stroke="var(--card)"
                    strokeWidth={1}
                    maxBarSize={26}
                  />
                  <Bar
                    dataKey="expectedIn"
                    stackId="flow"
                    fill={flowColors.expectedIn}
                    stroke="var(--card)"
                    strokeWidth={1}
                    maxBarSize={26}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="cashOutSigned"
                    stackId="flow"
                    fill={flowColors.cashOut}
                    stroke="var(--card)"
                    strokeWidth={1}
                    maxBarSize={26}
                  />
                  <Bar
                    dataKey="expectedOutSigned"
                    stackId="flow"
                    fill={flowColors.expectedOut}
                    stroke="var(--card)"
                    strokeWidth={1}
                    maxBarSize={26}
                    radius={[0, 0, 4, 4]}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
              {flowLegend.map((item) => (
                <span
                  key={item.key}
                  className="flex items-center gap-1.5 text-caption text-secondary-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: flowColors[item.key] }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon={CurrencyCircleDollar}
            title="Sem movimentação no período"
            description="Recebimentos e pagamentos aparecem aqui assim que forem lançados."
          />
        )}
      </CardContent>
    </Card>
  );
}

type CashFlowPoint = {
  label: string;
  cashIn: number;
  expectedIn: number;
  cashOut: number;
  expectedOut: number;
  cashOutSigned: number;
  expectedOutSigned: number;
};

function CashFlowTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: CashFlowPoint }>;
  label?: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-[var(--shadow-md)]">
      <p className="text-sm font-semibold">{label}</p>
      <div className="mt-2 grid gap-1">
        {flowLegend.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-4 text-caption"
          >
            <span className="flex items-center gap-1.5 text-secondary-foreground">
              <span
                aria-hidden="true"
                className="size-2 rounded-sm"
                style={{ backgroundColor: flowColors[item.key] }}
              />
              {item.label}
            </span>
            <span className="font-medium tabular-nums">
              {formatCurrency(point[item.key])}
            </span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-4 border-t border-border pt-1 text-caption font-semibold">
          <span>Saldo realizado</span>
          <span className="tabular-nums">
            {formatCurrency(point.cashIn - point.cashOut)}
          </span>
        </div>
      </div>
    </div>
  );
}

function PaymentMethodsCard({
  methods,
  total,
}: {
  methods: FinanceOverview["paymentMethods"];
  total: number;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <h2 className="font-semibold">Recebido por forma de pagamento</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Entradas confirmadas no período.
        </p>
      </CardHeader>
      {methods.length ? (
        <>
          <div className="divide-y divide-border">
            {methods.map((method) => {
              const Icon = methodIcons[method.methodType ?? ""] ?? Wallet;
              return (
                <div
                  key={`${method.name}-${method.methodType ?? ""}`}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {method.name}
                    </p>
                    {method.methodType ? (
                      <p className="truncate text-caption text-muted-foreground">
                        {methodTypeLabel(method.methodType)}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {formatCurrency(method.amount)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
            <span className="text-sm text-muted-foreground">
              Total recebido
            </span>
            <span className="text-heading-sm font-semibold tabular-nums">
              {formatCurrency(total)}
            </span>
          </div>
        </>
      ) : (
        <EmptyState
          icon={Wallet}
          title="Nenhum recebimento no período"
          description="Os valores aparecem aqui conforme os pagamentos são baixados."
        />
      )}
    </Card>
  );
}

function BucketsCard({
  title,
  buckets,
  tone,
  settledLabel,
}: {
  title: string;
  buckets: FinanceOverviewBuckets;
  tone: "success" | "destructive";
  settledLabel: string;
}) {
  const rows = [
    { label: "Em atraso", value: buckets.overdue, highlight: true },
    { label: "Para hoje", value: buckets.dueToday },
    { label: "Para este mês", value: buckets.dueMonth },
    { label: "Para este ano", value: buckets.dueYear },
    { label: `${settledLabel} no mês`, value: buckets.settledMonth },
    { label: `${settledLabel} no ano`, value: buckets.settledYear },
  ];

  return (
    <Card className="min-w-0">
      <CardHeader>
        <h2 className="font-semibold">{title}</h2>
      </CardHeader>
      <CardContent className="grid gap-2.5 p-5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4"
          >
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span
              className={cn(
                "text-sm font-medium tabular-nums",
                row.highlight && row.value > 0
                  ? tone === "success"
                    ? "text-warning-foreground"
                    : "text-destructive-foreground"
                  : "text-foreground",
              )}
            >
              {formatCurrency(row.value)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CategoriesCard({
  revenue,
  expense,
  canViewCash,
  canViewPayables,
}: {
  revenue: FinanceOverview["revenueCategories"];
  expense: FinanceOverview["expenseCategories"];
  canViewCash: boolean;
  canViewPayables: boolean;
}) {
  const [tab, setTab] = useState<"revenue" | "expense">(
    canViewCash ? "revenue" : "expense",
  );
  const source = tab === "revenue" ? revenue : expense;
  const slices = useMemo(() => topSlices(source), [source]);
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Categorias</h2>
        {canViewCash && canViewPayables ? (
          <div
            className="flex rounded-md border border-border bg-muted p-0.5"
            role="group"
            aria-label="Tipo de categoria"
          >
            {(
              [
                { id: "revenue", label: "Receita" },
                { id: "expense", label: "Despesa" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={tab === option.id}
                onClick={() => setTab(option.id)}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium transition-colors duration-[var(--motion-fast)]",
                  tab === option.id
                    ? "bg-card text-foreground shadow-[var(--shadow-soft)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </CardHeader>
      {slices.length ? (
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <div className="h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={44}
                  outerRadius={70}
                  paddingAngle={2}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {slices.map((slice, index) => (
                    <Cell
                      key={slice.name}
                      fill={chartSeries[index % chartSeries.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CategoryTooltip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="grid min-w-0 flex-1 gap-1.5">
            {slices.map((slice, index) => (
              <li
                key={slice.name}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{
                      backgroundColor: chartSeries[index % chartSeries.length],
                    }}
                  />
                  <span className="truncate text-sm text-secondary-foreground">
                    {slice.name}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatCurrency(slice.amount)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : (
        <EmptyState
          icon={ReceiptText}
          title="Sem lançamentos no período"
          description="Classifique receitas e despesas em categorias para ver a divisão aqui."
        />
      )}
    </Card>
  );
}

function CategoryTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
  total: number;
}) {
  const slice = payload?.[0];
  if (!active || !slice) return null;
  const amount = Number(slice.value ?? 0);

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-[var(--shadow-md)]">
      <p className="text-sm font-semibold">{slice.name}</p>
      <p className="mt-1 text-caption tabular-nums text-secondary-foreground">
        {formatCurrency(amount)}
        {total > 0 ? ` · ${((amount / total) * 100).toFixed(1)}%` : ""}
      </p>
    </div>
  );
}

// Junta a série diária em semanas (segunda a domingo) ou meses; o rótulo é o
// início do balde, que é o que o eixo mostra.
function bucketSeries(
  series: FinanceOverview["series"],
  granularity: Granularity,
): CashFlowPoint[] {
  const grouped = new Map<string, CashFlowPoint>();

  for (const point of series) {
    const key = bucketKey(point.bucket, granularity);
    const current = grouped.get(key) ?? {
      label: bucketLabel(key, granularity),
      cashIn: 0,
      expectedIn: 0,
      cashOut: 0,
      expectedOut: 0,
      cashOutSigned: 0,
      expectedOutSigned: 0,
    };

    current.cashIn += point.cashIn;
    current.expectedIn += point.expectedIn;
    current.cashOut += point.cashOut;
    current.expectedOut += point.expectedOut;
    current.cashOutSigned = -current.cashOut;
    current.expectedOutSigned = -current.expectedOut;
    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
}

function bucketKey(dateKey: string, granularity: Granularity) {
  if (granularity === "year") return `${dateKey.slice(0, 4)}-01-01`;
  if (granularity === "month") return `${dateKey.slice(0, 7)}-01`;
  if (granularity === "week") {
    const date = new Date(`${dateKey}T12:00:00Z`);
    const weekday = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
    return date.toISOString().slice(0, 10);
  }
  return dateKey;
}

function bucketLabel(dateKey: string, granularity: Granularity) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (granularity === "year") return dateKey.slice(0, 4);
  if (granularity === "month") {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    })
      .format(date)
      .replace(".", "");
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "");
}

function topSlices(entries: Array<{ name: string; amount: number }>) {
  const sorted = [...entries].sort((a, b) => b.amount - a.amount);
  if (sorted.length <= 6) return sorted;

  const head = sorted.slice(0, 5);
  const rest = sorted
    .slice(5)
    .reduce((total, entry) => total + entry.amount, 0);
  return rest > 0 ? [...head, { name: "Outros", amount: rest }] : head;
}

function percentChange(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatPercent(value: number) {
  const capped = Math.max(-999, Math.min(999, value));
  return `${capped > 0 ? "+" : ""}${capped.toFixed(1)}%`;
}

function methodTypeLabel(value: string) {
  const labels: Record<string, string> = {
    cash: "Dinheiro",
    pix: "Pix",
    credit_card: "Cartão de crédito",
    debit_card: "Cartão de débito",
    transfer: "Transferência",
    check: "Cheque",
    insurance: "Convênio",
    other: "Outros",
  };
  return labels[value] ?? value;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
