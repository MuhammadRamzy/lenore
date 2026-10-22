import { Component, StrictMode, type ReactNode } from "react";
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
} else {
  const app = location.pathname.startsWith("/pos")
    ? import("./pos/app").then((m) => <m.PosApp />)
    : location.pathname.startsWith("/manage")
      ? import("./management").then((m) => <m.Management />)
      : import("./sales/app").then((m) => <m.SalesApp />);
  const view = createRoot(root);
  app
    .then((node) =>
      view.render(
        <StrictMode>
          <Boundary>{node}</Boundary>
        </StrictMode>,
      ),
    )
    // Offline on first visit, or a stale page after an update.
    .catch(() => view.render(<Crash loadFailed />));
}

/** Last line of defence: a screen error never leaves a blank page. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  render() {
    return this.state.failed ? <Crash /> : this.props.children;
  }
}
function Crash({ loadFailed = false }: { loadFailed?: boolean }) {
  const pos = location.pathname.startsWith("/pos");
  return (
    <main className="app-crash" role="alert">
      <h1>{loadFailed ? "Lenore could not load" : "Something went wrong"}</h1>
      <p>
        {loadFailed
          ? "Check the internet connection, then try again."
          : "This screen hit a problem. Reloading usually fixes it."}
        {pos &&
          " Bills already saved on this counter, including offline ones, are kept."}
      </p>
      <button className="btn btn-primary" onClick={() => location.reload()}>
        Reload
      </button>
    </main>
  );
}
// Installable app shell for the catalogue and workspace (secure contexts only).
if ("serviceWorker" in navigator && !data && window.isSecureContext)
  void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
