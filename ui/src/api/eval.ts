import { api } from "./client";
import type { EvalChartData } from "@paperclipai/autoresearch";

export const evalApi = {
  getConfig: (companyId: string) =>
    api.get(`/companies/${companyId}/eval`),

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
