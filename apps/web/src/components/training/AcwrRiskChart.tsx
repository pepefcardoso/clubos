"use client";

import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
} from "recharts";
import type { AcwrEntry } from "@/lib/api/workload";
import { formatDateLabel } from "@/lib/format";

interface ChartDataPoint {
    date: string;
    acwr: number | null;
    acuteLoad: number;
    chronicLoad: number;
    dailyAu: number;
    riskZone: string;
}

function prepareChartData(history: AcwrEntry[]): ChartDataPoint[] {
    return history.map((entry) => ({
        date: formatDateLabel(entry.date),
        acwr: entry.acwrRatio,
        acuteLoad: entry.acuteLoadAu,
        chronicLoad: Math.round(entry.chronicLoadAu),
        dailyAu: entry.dailyAu,
        riskZone: entry.riskZone,
    }));
}

interface TooltipPayloadItem {
    name: string;
    value: number | null;
    color: string;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayloadItem[];
    label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    return (
        <div className="bg-white border border-neutral-200 rounded-md shadow-md p-3 text-xs min-w-[160px]">
            <p className="font-semibold text-neutral-700 mb-2 pb-1.5 border-b border-neutral-100">
                {label}
            </p>
            {payload.map((entry) => (
                <div
                    key={entry.name}
                    className="flex items-center justify-between gap-4 py-0.5"
                >
                    <span className="flex items-center gap-1.5 text-neutral-500">
                        <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: entry.color }}
                        />
                        {entry.name}
                    </span>
                    <span className="font-mono font-semibold text-neutral-800 tabular-nums">
                        {entry.value !== null && entry.value !== undefined
                            ? entry.value.toFixed(entry.name === "ACWR" ? 2 : 0)
                            : "—"}
                    </span>
                </div>
            ))}
        </div>
    );
}

interface AcwrRiskChartProps {
    history: AcwrEntry[];
}

export function AcwrRiskChart({ history }: AcwrRiskChartProps) {
    const data = prepareChartData(history);

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-neutral-400 text-sm">
                Nenhum dado disponível para o período selecionado.
            </div>
        );
    }

    const tickInterval = data.length > 20 ? Math.floor(data.length / 10) : "preserveStartEnd";

    return (
        <ResponsiveContainer width="100%" height={220}>
            <ComposedChart
                data={data}
                margin={{ top: 4, right: 32, bottom: 0, left: -20 }}
            >
                <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e8e6e0"
                    vertical={false}
                />
                <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#78746a" }}
                    tickLine={false}
                    axisLine={false}
                    interval={tickInterval}
                />
                <YAxis
                    yAxisId="load"
                    tick={{ fontSize: 10, fill: "#78746a" }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(v: number) => v.toLocaleString("pt-BR")}
                />
                <YAxis
                    yAxisId="ratio"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "#78746a" }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    domain={[0, 2.5]}
                    tickFormatter={(v: number) => v.toFixed(1)}
                />
                <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ stroke: "#d1cec6", strokeWidth: 1 }}
                />
                <Legend
                    wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }}
                    iconType="circle"
                    iconSize={7}
                />

                <Bar
                    yAxisId="load"
                    dataKey="dailyAu"
                    name="Carga diária (AU)"
                    fill="#d9edd9"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={14}
                />

                <Line
                    yAxisId="load"
                    type="monotone"
                    dataKey="acuteLoad"
                    name="Carga aguda (7d)"
                    stroke="#4d9e4d"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                />

                <Line
                    yAxisId="load"
                    type="monotone"
                    dataKey="chronicLoad"
                    name="Carga crônica (28d)"
                    stroke="#f0b429"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                />

                <Line
                    yAxisId="ratio"
                    type="monotone"
                    dataKey="acwr"
                    name="ACWR"
                    stroke="#c0392b"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    connectNulls={false}
                />

                <ReferenceLine
                    yAxisId="ratio"
                    y={0.8}
                    stroke="#2471a3"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                    label={{
                        value: "0.8",
                        position: "insideTopRight",
                        fontSize: 9,
                        fill: "#2471a3",
                        dy: 2,
                    }}
                />
                <ReferenceLine
                    yAxisId="ratio"
                    y={1.3}
                    stroke="#d4940a"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                    label={{
                        value: "1.3",
                        position: "insideTopRight",
                        fontSize: 9,
                        fill: "#d4940a",
                        dy: 2,
                    }}
                />
                <ReferenceLine
                    yAxisId="ratio"
                    y={1.5}
                    stroke="#c0392b"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                    label={{
                        value: "1.5",
                        position: "insideTopRight",
                        fontSize: 9,
                        fill: "#c0392b",
                        dy: 2,
                    }}
                />
            </ComposedChart>
        </ResponsiveContainer>
    );
}