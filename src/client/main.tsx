import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import { PublicSite } from "./public";
import { Management } from "./management";
import { api } from "./api";
import type { SiteConfig } from "./brand";
import "./styles.css";
import "./brand-system.css";

function App() {
  const [config, setConfig] = useState<SiteConfig>({
    demo: false,
    whatsapp: "",
    integration: "disconnected",
  });
  useEffect(() => {
    api<SiteConfig>("/config")
      .then(setConfig)
      .catch(() => undefined);
  }, []);
  return (
    <>
      {config.demo && (
        <div className="demo-bar">
          {location.pathname.startsWith("/manage")
            ? "Local workspace · Sample records · Billing not connected"
            : "Catalogue preview · Illustrative products and availability"}
        </div>
      )}
      {location.pathname.startsWith("/manage") ? (
        <Management config={config} />
      ) : (
        <PublicSite config={config} />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
