import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { Toaster } from "@/components/ui/sonner";
import { applyTheme } from "./theme/theme.ts";
import "./index.css";

applyTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster position="bottom-center" duration={6000} />
  </StrictMode>,
);
