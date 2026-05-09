import { api } from "./client";
import type { EvalChartData } from "@paperclipai/autoresearch";

export interface EvalConfigSummary {
  id: string;
  companyId: string;
  repoUrl: string;
  evalPath: string;
  direction: string;
  scoreUnit: string | null;
  baselineRef: string | null;
  lockedAt: string | null;
  bestScore: number | null;
  timeoutMs: number;
}

export const evalApi = {
  getConfig: (companyId: string) =>
    api.get<EvalConfigSummary>(`/companies/${companyId}/eval`),

  createConfig: (companyId: string, data: {
    repoUrl: string;
    evalPath: string;
    direction: string;
    scoreUnit?: string;
    timeoutMs?: number;
  }) =>
    api.post(`/companies/${companyId}/eval`, data),

  lockBaseline: (companyId: string, ref: string) =>
    api.post(`/companies/${companyId}/eval/lock`, { ref }),

  getChartData: (companyId: string) =>
    api.get<EvalChartData>(`/companies/${companyId}/eval/chart`),
};
