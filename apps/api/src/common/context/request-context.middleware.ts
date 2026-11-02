import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DEFAULT_LOCALE, localeSchema } from "@gugu/contracts";
import { RequestContext } from "./request-context";
import { resolveRequestId } from "./request-id";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const requestId = resolveRequestId(req);
    res.setHeader("x-request-id", requestId);
    const header = req.headers["accept-language"]?.slice(0, 2);
    const locale = localeSchema.safeParse(header).data ?? DEFAULT_LOCALE;
    RequestContext.run({ requestId, locale, actor: { type: "anonymous" }, salonId: null }, next);
  }
}
