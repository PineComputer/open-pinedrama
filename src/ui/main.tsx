import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { applyTheme } from "./theme/theme.ts";
import "./theme/reveric-themes.css";
import "./theme/reveric-tokens.css";
import "./theme/base.css";
import "./styles.css";
import "./components/components.css";
import "./shell/shell.css";

applyTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
