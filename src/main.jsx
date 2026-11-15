import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import { initFx } from "./fx";
import { initTheme } from "./Theme";
import { hideBoot } from "./boot";
import "./styles.css";

initFx();
initTheme();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>
);

// Let React paint first, then fade the loading splash away.
requestAnimationFrame(() => requestAnimationFrame(hideBoot));
