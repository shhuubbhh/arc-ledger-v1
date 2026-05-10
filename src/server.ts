type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Move all logic and imports inside the handler to satisfy Cloudflare's global scope rules
      const [{ renderErrorPage }, { consumeLastCapturedError }] = await Promise.all([
        import("./lib/error-page"),
        import("./lib/error-capture")
      ]);

      const brandedErrorResponse = (error?: Error | string) => {
        return new Response(renderErrorPage(error), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      };

      try {
        const m = await import("@tanstack/react-start/server-entry");
        const handler = (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry);
        
        const response = await handler.fetch(request, env, ctx);
        
        // Handle h3 swallowed errors
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
            } catch { /* ignore parse error */ }
          }
        }
        
        return response;
      } catch (error: any) {
        const details = error?.stack || error?.message || String(error);
        console.error("SSR Crash:", details);
        return brandedErrorResponse(details);
      }
    } catch (critical: any) {
      return new Response(`Critical Boot Error: ${critical?.message || critical}`, { status: 500 });
    }
  },
};
