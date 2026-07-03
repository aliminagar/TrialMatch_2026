"use client";

import { useReducedMotion } from "framer-motion";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  aggregateDistribution,
  categoryDistribution,
  scoreRanking,
} from "@/lib/trialViews";
import type { AggregateVerdict, TrialVerdict } from "@/lib/types";
import { verdictTone, type VerdictTone } from "@/lib/utils";

const TONE_COLOR: Record<VerdictTone, string> = {
  pass: "var(--pass-ring-to)",
  review: "var(--review-ring-to)",
  fail: "var(--fail-ring-to)",
};

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--fg)",
  fontSize: 12,
  boxShadow: "var(--shadow)",
};

function verdictText(v: AggregateVerdict): string {
  return v.replace(/_/g, " ").toLowerCase();
}

function categoryText(c: string): string {
  return c.replace(/_/g, " ");
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface-2/40 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-fg-subtle">
        {title}
      </p>
      {children}
    </div>
  );
}

export function ResultsCharts({ trials }: { trials: TrialVerdict[] }) {
  const reduce = useReducedMotion();
  const animate = !reduce;

  const dist = aggregateDistribution(trials).map((d) => ({
    ...d,
    name: verdictText(d.verdict),
    color: TONE_COLOR[verdictTone(d.verdict)],
  }));
  const ranking = scoreRanking(trials, 8).map((r) => ({
    ...r,
    color: TONE_COLOR[verdictTone(r.verdict)],
  }));
  const categories = categoryDistribution(trials).map((c) => ({
    ...c,
    name: categoryText(c.category),
  }));

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Panel title="Verdict mix">
        <div className="relative h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={dist}
                dataKey="count"
                nameKey="name"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={animate}
              >
                {dist.map((d) => (
                  <Cell key={d.verdict} fill={d.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums text-fg">
              {trials.length}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-fg-subtle">
              trials
            </span>
          </div>
        </div>
      </Panel>

      <Panel title="Trials by score">
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={ranking}
              margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
            >
              <XAxis type="number" domain={[0, 1]} hide />
              <YAxis
                type="category"
                dataKey="nctId"
                width={92}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--fg-subtle)", fontSize: 10, fontFamily: "monospace" }}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-3)" }}
                contentStyle={tooltipStyle}
                formatter={(value) => [Number(value).toFixed(2), "score"]}
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} isAnimationActive={animate}>
                {ranking.map((r) => (
                  <Cell key={r.nctId} fill={r.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Criteria by category">
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            {/* Horizontal layout: category names sit in a left gutter (no
                rotation) so every label renders fully at any container width. */}
            <BarChart
              layout="vertical"
              data={categories}
              margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
              barCategoryGap={3}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={104}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--fg-subtle)", fontSize: 11 }}
              />
              <Tooltip cursor={{ fill: "var(--surface-3)" }} contentStyle={tooltipStyle} />
              <Bar
                dataKey="count"
                fill="var(--secondary-strong)"
                radius={[0, 4, 4, 0]}
                isAnimationActive={animate}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
