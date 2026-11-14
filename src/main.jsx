import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initFx } from "./fx";
import { initTheme } from "./Theme";
import "./styles.css";

initFx();
initTheme();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
