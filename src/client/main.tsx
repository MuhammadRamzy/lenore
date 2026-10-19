import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "./design.css";
import { Site } from "./site/site";
import type { SitePage } from "./site/types";

const root = document.getElementById("root")!;
const data = document.getElementById("page-data");

if (data) {
  // Server-rendered website page: attach to the existing HTML.
  const page = JSON.parse(data.textContent ?? "{}") as SitePage;
  hydrateRoot(
    root,
    <StrictMode>
      <Site page={page} />
    </StrictMode>,
  );
} else if (location.pathname.startsWith("/pos")) {
  void import("./pos/app").then(({ PosApp }) =>
    createRoot(root).render(
      <StrictMode>
        <PosApp />
      </StrictMode>,
    ),
  );
} else if (location.pathname.startsWith("/manage")) {
  void import("./management").then(({ Management }) =>
    createRoot(root).render(
      <StrictMode>
        <Management />
      </StrictMode>,
    ),
  );
} else {
  void import("./sales/app").then(({ SalesApp }) =>
    createRoot(root).render(
      <StrictMode>
        <SalesApp />
      </StrictMode>,
    ),
  );
}
// Installable app shell for the catalogue and workspace (secure contexts only).
if ("serviceWorker" in navigator && !data && window.isSecureContext)
  void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
