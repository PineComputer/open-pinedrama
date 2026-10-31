import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { studioRouter } from "./routes.tsx";
import { Toaster } from "@/components/ui/sonner";
import { applyTheme } from "./theme/theme.ts";
import "./index.css";

applyTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={studioRouter()} />
    <Toaster position="bottom-center" duration={6000} />
  </StrictMode>,
);
