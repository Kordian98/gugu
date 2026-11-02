import { Controller, Get, Res } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import {
  healthReportSchema,
  type HealthReport,
  type Liveness,
  livenessSchema,
} from "@gugu/contracts";
import { Public } from "../../common/guards/auth-policy";
import { CheckHealthUseCase } from "./application/check-health.use-case";

@ApiTags("health")
@Controller("health")
@Public()
export class HealthController {
  constructor(private readonly checkHealth: CheckHealthUseCase) {}

  @Get()
  @ApiOperation({
    operationId: "health.ready",
    summary: "Readiness: database and Redis reachability.",
  })
  @ApiResponse({
    status: 200,
    description: "All dependencies up.",
    standardSchema: healthReportSchema,
  })
  @ApiResponse({
    status: 503,
    description: "At least one dependency down.",
    standardSchema: healthReportSchema,
  })
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.checkHealth.execute();
    res.status(report.status === "ok" ? 200 : 503);
    return report;
  }

  @Get("live")
  @ApiOperation({
    operationId: "health.live",
    summary: "Liveness: the process is serving requests.",
  })
  @ApiResponse({ status: 200, description: "Process is alive.", standardSchema: livenessSchema })
  live(): Liveness {
    return { status: "ok" };
  }
}
