"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import { useChargesHistory } from "@/hooks/use-dashboard";
import { formatBRL, formatMonthLabel } from "@/lib/format";

interface TooltipEntry {
    name: string;
    value: number;
    color: string;
    payload: {
        paidAmountCents: number;
        overdueAmountCents: number;
    };
}

function CustomTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: TooltipEntry[];
    label?: string;
}) {
    if (!active || !payload?.length) return null;

    return (
        <div className="bg-white border border-neutral-200 rounded-md shadow-md p-3 text-sm min-w-[180px]">
            <p className="font-medium text-neutral-700 mb-2">{label}</p>

            {payload.map((entry) => (
                <div key={entry.name} className="flex justify-between gap-4 py-0.5">
                    <span style={{ color: entry.color }} className="font-medium">
                        {entry.name}
                    </span>
                    <span className="font-mono text-neutral-800">{entry.value}</span>
                </div>
            ))}

            {payload[0]?.payload.paidAmountCents != null && (
                <div className="mt-2 pt-2 border-t border-neutral-100 font-mono text-xs text-neutral-500">
                    Recebido: {formatBRL(payload[0].payload.paidAmountCents)}
                </div>
            )}
        </div>
    );
}

function ChartSkeleton() {
    return (
        <div
            className="h-[260px] flex flex-col justify-end gap-2"
            aria-busy="true"
            aria-label="Carregando gráfico"
        >
            <div className="flex items-end justify-around h-full px-4 gap-3">
                {[55, 80, 40, 90, 65, 75].map((h, i) => (
                    <div key={i} className="flex gap-1 items-end flex-1">
                        {[h, Math.round(h * 0.4), Math.round(h * 0.25)].map((barH, j) => (
                            <div
                                key={j}
                                className="flex-1 rounded-t bg-neutral-200 animate-pulse"
                                style={{
                                    height: `${barH}%`,
                                    animationDelay: `${(i * 3 + j) * 60}ms`,
                                }}
                            />
                        ))}
                    </div>
                ))}
            </div>

            <div className="flex justify-around px-4">
                {[...Array(6)].map((_, i) => (
                    <div
                        key={i}
                        className="h-3 w-10 rounded bg-neutral-200 animate-pulse"
                        style={{ animationDelay: `${i * 80}ms` }}
                    />
                ))}
            </div>
        </div>
    );
}

export function DelinquencyChart() {
    const { data, isLoading, isError } = useChargesHistory(6);

    if (isError) {
        return (
            <div
                role="alert"
                className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-danger"
            >
                Não foi possível carregar o histórico de cobranças. Tente recarregar a
                página.
            </div>
        );
    }

    const chartData = (data ?? []).map((d) => ({
        ...d,
        monthLabel: formatMonthLabel(d.month),
    }));

    return (
        <div className="bg-white border border-neutral-200 rounded-md p-6">
            <div className="mb-6">
                <h2 className="text-base font-semibold text-neutral-900">
                    Histórico de Cobranças
                </h2>
                <p className="text-sm text-neutral-500 mt-0.5">
                    Evolução nos últimos 6 meses
                </p>
            </div>

            {isLoading ? (
                <ChartSkeleton />
            ) : (
                <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                        data={chartData}
                        margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                        barCategoryGap="30%"
                        barGap={3}
                    >
                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e8e6e0"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="monthLabel"
                            tick={{ fontSize: 12, fill: "#78746a" }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 12, fill: "#78746a" }}
                            axisLine={false}
                            tickLine={false}
                            width={28}
                        />
                        <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ fill: "#f4f3ef" }}
                        />
                        <Legend
                            iconType="square"
                            iconSize={10}
                            wrapperStyle={{
                                fontSize: 12,
                                color: "#78746a",
                                paddingTop: 16,
                            }}
                        />
                        <Bar
                            dataKey="paid"
                            name="Pagas"
                            fill="#2d7d2d"
                            radius={[3, 3, 0, 0]}
                        />
                        <Bar
                            dataKey="overdue"
                            name="Em atraso"
                            fill="#c0392b"
                            radius={[3, 3, 0, 0]}
                        />
                        <Bar
                            dataKey="pending"
                            name="Pendentes"
                            fill="#f0b429"
                            radius={[3, 3, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}