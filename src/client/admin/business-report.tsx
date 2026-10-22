import { useEffect, useState } from "react";
import { FileBarChart2, FileDown, RefreshCw } from "lucide-react";
import { api, errorMessage } from "../api";
import type { BusinessReport } from "../../report";

type Kind = "month" | "quarter" | "year" | "custom";
type Archived = {
  id: string;
  reference: string;
  kind: Kind;
  from: string;
  to: string;
  version: number;
  bytes: number;
  generatedBy: string;
  savedAt: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();
const todayIst = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const monthName = (y: number, m: number) =>
  new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** Turns the picker into dates and a human title for the cover. */
function resolve(kind: Kind, value: string, from: string, to: string) {
  if (kind === "month") {
    const [y, m] = value.split("-").map(Number);
    return {
      from: `${y}-${pad(m)}-01`,
      to: `${y}-${pad(m)}-${pad(lastDay(y, m))}`,
      label: monthName(y, m),
    };
  }
  if (kind === "quarter") {
    // Indian financial-year quarters: Q1 = April–June.
    const [fy, q] = value.split("-Q").map(Number);
    const startMonth = ((q - 1) * 3 + 3) % 12; // 0-based: Apr, Jul, Oct, Jan
    const y = q === 4 ? fy + 1 : fy;
    const endMonth = startMonth + 3;
    return {
      from: `${y}-${pad(startMonth + 1)}-01`,
      to: `${y}-${pad(endMonth)}-${pad(lastDay(y, endMonth))}`,
      label: `Q${q} FY ${fy}-${String(fy + 1).slice(2)} (${monthName(y, startMonth + 1).split(" ")[0]} – ${monthName(y, endMonth)})`,
    };
  }
  if (kind === "year") {
    const fy = Number(value);
    return {
      from: `${fy}-04-01`,
      to: `${fy + 1}-03-31`,
      label: `Financial year ${fy}-${String(fy + 1).slice(2)}`,
    };
  }
  return { from, to, label: `${from} to ${to}` };
}

/** Monthly, quarterly and yearly business reports, kept as a printable archive. */
export function BusinessReportPanel({
  from: rangeFrom,
  to: rangeTo,
}: {
  from: string;
  to: string;
}) {
  const now = todayIst();
  const y = Number(now.slice(0, 4)),
    m = Number(now.slice(5, 7));
  const currentFy = m >= 4 ? y : y - 1;
  // Default: the last complete month, the usual one to file.
  const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const [kind, setKind] = useState<Kind>("month");
  const [month, setMonth] = useState(lastMonth);
  const [quarter, setQuarter] = useState(
    `${currentFy}-Q${m >= 4 ? Math.floor((m - 4) / 3) + 1 : 4}`,
  );
  const [year, setYear] = useState(String(currentFy));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [archive, setArchive] = useState<Archived[] | null>(null);
  const loadArchive = () =>
    api<Archived[]>("/admin/reports/archive")
      .then(setArchive)
      .catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void loadArchive();
  }, []);
  const value = kind === "month" ? month : kind === "quarter" ? quarter : year;
  const target = resolve(kind, value, rangeFrom, rangeTo);
  const future = target.from > now;

  async function generate() {
    setError("");
    try {
      setBusy("Reserving a reference number…");
      const reserved = await api<{ id: string; reference: string }>(
        "/admin/reports/archive",
        { kind, from: target.from, to: target.to },
        "POST",
      );
      setBusy("Gathering the figures…");
      const data = await api<BusinessReport>(
        `/admin/reports/business?from=${target.from}&to=${target.to}`,
      );
      setBusy("Drawing the report…");
      const { businessReportPdf } = await import("./report-pdf");
      const blob = await businessReportPdf(
        data,
        { kind, label: target.label },
        reserved.reference,
      );
      setBusy("Saving to the archive…");
      const saved = await fetch(
        `/api/admin/reports/archive/${reserved.id}/pdf`,
        { method: "PUT", body: blob, credentials: "same-origin" },
      );
      if (!saved.ok)
        throw new Error(
          "The report was created but could not be saved to the archive.",
        );
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
      await loadArchive();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }

  const fyOptions = Array.from({ length: 6 }, (_, i) => currentFy - i);
  return (
    <section className="work-section business-report">
      <div className="work-section-title report-head">
        <h2>
          <FileBarChart2 size={18} /> Business report (PDF)
        </h2>
      </div>
      <p className="muted">
        A complete, printable report for owners and accountants: headline
        figures with comparisons, sales trends, best sellers, money owed,
        profit, GST, stock, checks and action points, explained in plain
        language. Every report is saved below as a record.
      </p>
      <div className="report-builder">
        <label>
          Report for
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="month">A month</option>
            <option value="quarter">A quarter</option>
            <option value="year">A financial year</option>
            <option value="custom">The dates selected above</option>
          </select>
        </label>
        {kind === "month" && (
          <label>
            Month
            <input
              type="month"
              value={month}
              max={now.slice(0, 7)}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
        )}
        {kind === "quarter" && (
          <label>
            Quarter
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
            >
              {fyOptions.flatMap((fy) =>
                [4, 3, 2, 1].map((q) => (
                  <option key={`${fy}-${q}`} value={`${fy}-Q${q}`}>
                    Q{q} FY {fy}-{String(fy + 1).slice(2)}
                  </option>
                )),
              )}
            </select>
          </label>
        )}
        {kind === "year" && (
          <label>
            Financial year
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              {fyOptions.map((fy) => (
                <option key={fy} value={fy}>
                  FY {fy}-{String(fy + 1).slice(2)} (Apr {fy} – Mar {fy + 1})
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="button dark"
          disabled={!!busy || future}
          onClick={() => void generate()}
        >
          <FileDown size={16} /> {busy || "Generate and save"}
        </button>
      </div>
      <p className="muted small">
        {future
          ? "That period has not started yet."
          : `${target.label}: ${target.from} to ${target.to}${target.to > now ? " (period still running; figures to date)" : ""}.`}
      </p>
      {error && <p className="error banner">{error}</p>}
      <div className="work-section-title report-head archive-head">
        <h3>Saved reports</h3>
        <button
          className="row-action"
          onClick={() => void loadArchive()}
          aria-label="Refresh saved reports"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {archive && !archive.length && (
        <p className="muted">No reports saved yet.</p>
      )}
      {!!archive?.length && (
        <div className="report-scroll">
          <table className="data-table compact">
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Period</th>
                <th scope="col">Saved</th>
                <th scope="col">By</th>
                <th scope="col" className="num">
                  Size
                </th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {archive.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.reference}</strong>
                  </td>
                  <td>
                    {a.from} to {a.to}
                  </td>
                  <td>
                    {new Date(a.savedAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Kolkata",
                    })}
                  </td>
                  <td>{a.generatedBy}</td>
                  <td className="num">{Math.round(a.bytes / 1024)} KB</td>
                  <td className="num">
                    <a
                      className="row-action"
                      href={`/api/admin/reports/archive/${a.id}/pdf`}
                      target="_blank"
                      rel="noopener"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
