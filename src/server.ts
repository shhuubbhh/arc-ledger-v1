import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

async function getServerEntry(): Promise<ServerEntry> {
  const m = await import("@tanstack/react-start/server-entry");
  return (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry);
}

function brandedErrorResponse(error?: any): Response {
  return new Response(renderErrorPage(error), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      
      if (response.status >= 500) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const body = await response.clone().text();
          try {
            const payload = JSON.parse(body);
            if (payload?.unhandled && payload?.message === "HTTPError") {
              const captured = consumeLastCapturedError();
              return brandedErrorResponse(captured || body);
            }
          } catch { /* ignore */ }
        }
      }
      
      return response;
    } catch (error: any) {
      console.error(error);
      return brandedErrorResponse(error);
    }
  },
};
