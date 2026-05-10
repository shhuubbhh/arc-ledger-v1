import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error("Middleware Error:", error);
    // Don't swallow the error with a generic page here; 
    // let it propagate to server.ts for better logging.
    throw error;
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
