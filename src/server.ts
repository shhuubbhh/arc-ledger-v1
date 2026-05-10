type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Polyfill common Node.js globals that some Web3 libraries expect
    if (typeof globalThis.Buffer === "undefined") {
      try {
        const { Buffer } = await import("node:buffer");
        globalThis.Buffer = Buffer;
      } catch (e) { /* ignore */ }
    }
    
    if (typeof globalThis.process === "undefined") {
      (globalThis as any).process = { env: {} };
    }

    try {
      const [{ renderErrorPage }, { consumeLastCapturedError }] = await Promise.all([
        import("./lib/error-page"),
        import("./lib/error-capture")
      ]);

      const brandedErrorResponse = (error?: any) => {
        const message = error?.stack || error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
        return new Response(renderErrorPage(message), {
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
        console.error("SSR Crash:", error);
        return brandedErrorResponse(error);
      }
    } catch (critical: any) {
      console.error("Critical Boot Error:", critical);
      return new Response(`Critical Boot Error: ${critical?.stack || critical?.message || critical}`, { status: 500 });
    }
  },
};
