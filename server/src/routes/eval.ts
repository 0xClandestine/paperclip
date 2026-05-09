import { Router } from "express";
import { autoresearchService } from "@paperclipai/autoresearch";
import { assertCompanyAccess } from "./authz.js";

export function evalRoutes(db: unknown) {
  const router = Router();
  const svc = autoresearchService(db);

  /** Get eval config for a project. */
  router.get("/companies/:companyId/eval", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const config = await svc.getConfigByCompanyId(companyId);
    if (!config) {
      res.status(404).json({ error: "No eval config for this project" });
      return;
    }
    res.json(config);
  });

  /** Create eval config for a project. */
  router.post("/companies/:companyId/eval", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { repoUrl, evalPath, direction, scoreUnit, timeoutMs } = req.body;
    if (!repoUrl || !evalPath || !direction) {
      res.status(400).json({ error: "repoUrl, evalPath, and direction are required" });
      return;
    }

    const existing = await svc.getConfigByCompanyId(companyId);
    if (existing) {
      res.status(409).json({ error: "Eval config already exists for this project" });
      return;
    }

    const config = await svc.createConfig({
      companyId,
      repoUrl,
      evalPath,
      direction,
      scoreUnit,
      timeoutMs,
    });
    res.status(201).json(config);
  });

  /** Lock eval baseline to a git ref. */
  router.post("/companies/:companyId/eval/lock", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { ref } = req.body;
    if (!ref) {
      res.status(400).json({ error: "ref is required" });
      return;
    }

    const config = await svc.lockBaseline(companyId, ref);
    if (!config) {
      res.status(404).json({ error: "No eval config for this project" });
      return;
    }
    res.json(config);
  });

  /** Get chart data for the dashboard. */
  router.get("/companies/:companyId/eval/chart", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const data = await svc.getChartData(companyId);
    if (!data) {
      res.status(404).json({ error: "No eval data for this project" });
      return;
    }
    res.json(data);
  });

  return router;
}
