import { useQuery } from "@tanstack/react-query";
import type { ExperimentDataPoint } from "@paperclipai/autoresearch";
import { evalApi } from "../api/eval";

interface Props {
  companyId: string;
}

const CHART_W = 600;
const CHART_H = 200;
const PAD_L = 50;
const PAD_R = 50;
const PAD_T = 12;
const PAD_B = 24;

export function EvalChart({ companyId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["eval", "chart", companyId],
    queryFn: () => evalApi.getChartData(companyId),
    enabled: !!companyId,
    staleTime: 15_000,
  });

  if (isLoading) return <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Loading chart...</div>;
  if (error || !data) return null;
  if (data.points.length === 0) return <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No experiments yet. Create an experiment to see progress.</div>;

  const { points, direction, scoreUnit, bestScore, totalExperiments } = data;

  // Compute ranges
  const scores = points.map((p: ExperimentDataPoint) => p.runningBestScore).filter((s: number | null): s is number => s !== null);
  const costs = points.map((p: ExperimentDataPoint) => p.cumulativeCostCents);
  const scoreMin = Math.min(...scores);
  const scoreMax = Math.max(...scores);
  const scoreRange = scoreMax - scoreMin || 1;
  const costMax = Math.max(...costs, 1);
  const px = (i: number) => PAD_L + (i / Math.max(points.length - 1, 1)) * (CHART_W - PAD_L - PAD_R);
  const py = (s: number) => PAD_T + ((scoreMax - s) / scoreRange) * (CHART_H - PAD_T - PAD_B);
  const cy = (c: number) => CHART_H - PAD_B - (c / costMax) * (CHART_H - PAD_T - PAD_B);

  const bestLine = scores.map((s, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(s)}`).join(" ");
  const costLine = costs.map((c, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${cy(c)}`).join(" ");

  const dotColor = (p: ExperimentDataPoint) =>
    p.disposition === "keep" ? (p.isBest ? "#22c55e" : "#4ade80") :
    p.disposition === "discard" ? "#ef4444" : "#6b7280";

  const kept = points.filter((p) => p.disposition === "keep").length;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Progress</h3>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Best: <strong className="text-foreground">{bestScore} {scoreUnit}</strong></span>
          <span>Experiments: <strong className="text-foreground">{totalExperiments}</strong> ({kept} kept)</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto">
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = PAD_T + frac * (CHART_H - PAD_T - PAD_B);
          return (
            <g key={frac}>
              <line x1={PAD_L} y1={y} x2={CHART_W - PAD_R} y2={y} stroke="#27272a" strokeWidth="0.5" />
              {frac < 1 && (
                <text x={PAD_L - 6} y={y + 4} textAnchor="end" className="text-[10px]" fill="#71717a">
                  {(scoreMax - frac * scoreRange).toFixed(1)}
                </text>
              )}
            </g>
          );
        })}
        {/* Score line */}
        <path d={bestLine} fill="none" stroke="#8b5cf6" strokeWidth="1.5" />
        {/* Cost line */}
        {costMax > 0 && (
          <path d={costLine} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
        )}
        {/* Dots */}
        {points.map((p) => (
          <circle key={p.id} cx={px(points.indexOf(p))} cy={p.runningBestScore ? py(p.runningBestScore) : 0} r="4" fill={dotColor(p)} stroke="#18181b" strokeWidth="1">
            <title>
              {`#${p.index}: ${p.score} ${scoreUnit} (${p.disposition})`}
              {p.costCents > 0 ? ` — $${(p.costCents / 100).toFixed(2)}` : ""}
            </title>
          </circle>
        ))}
        {/* Legend */}
        <g transform={`translate(${PAD_L}, ${CHART_H - 4})`}>
          <line x1={0} y1={0} x2={20} y2={0} stroke="#8b5cf6" strokeWidth="1.5" />
          <text x={24} y={4} className="text-[10px]" fill="#a1a1aa">{direction === "lower" ? "↓ best score" : "↑ best score"}</text>
          {costMax > 0 && (
            <>
              <line x1={130} y1={0} x2={150} y2={0} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" />
              <text x={154} y={4} className="text-[10px]" fill="#a1a1aa">cost</text>
            </>
          )}
        </g>
      </svg>
    </div>
  );
}
