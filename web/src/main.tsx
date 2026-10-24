import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { NotFound } from "./components/NotFound.js";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles.css";
import "./styles/layout.css";
import "./styles/board.css";
import "./styles/editor.css";
import "./styles/stepper.css";
import "./styles/chrome.css";
import "./styles/motion.css";
import "./styles/ui.css";
import "./styles/components.css";

const isKnownPath = (pathname: string): boolean => pathname === "/" || pathname === "/index.html";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isKnownPath(window.location.pathname) ? <App /> : <NotFound />}
  </StrictMode>,
);
