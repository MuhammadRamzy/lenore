import { useEffect, useMemo, useState } from "react";
import { Check, Download, Printer, Upload, X } from "lucide-react";
import {
  money,
  movementLabel,
  percent,
  type AccessMode,
  type MovementKind,
  type PricingMode,
  type Product,
  type Quotation,
  type QuotationStatus,
  type TeamMember,
} from "../../shared";
import { api, errorMessage } from "../api";
import { Overlay } from "../overlay";

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "Never";
const csvCell = (v: unknown) => {
  const t = String(v ?? "");
  return `"${(/^[\s]*[=+@-]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
};
function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")],
      {
        type: "text/csv;charset=utf-8",
      },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ───────── Insights ───────── */
type Analytics = {
  days: number;
  totals: {
    quotes: number;
    value: number;
    won: number;
    wonValue: number;
    unpriced: number;
  };
  byStatus: { status: QuotationStatus; n: number }[];
  byPerson: {
    id: string;
    name: string;
    quotes: number;
    value: number;
    won: number;
  }[];
  daily: { day: string; quotes: number; value: number }[];
  topQuoted: {
    productId: string;
    code: string;
    name: string;
    quotes: number;
    quantity: number;
  }[];
  topViewed: { productId: string; code: string; name: string; views: number }[];
  views: number;
  stock: {
    out: number;
    low: number;
    noPhoto: number;
    noPrice: number;
    costValue: number;
    mrpValue: number;
    uncosted: number;
    products: number;
  };
  team: { members: number; active: number; activeToday: number };
};
export function InsightsPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Analytics>(`/admin/analytics?days=${days}`)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [days]);
  return (
    <div className="admin-stack">
      <div className="table-tools">
        <div className="filter-tabs" role="group" aria-label="Period">
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              className={days === d ? "selected" : ""}
              aria-pressed={days === d}
              onClick={() => setDays(d)}
            >
              {d === 365 ? "12 months" : `${d} days`}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error banner">{error}</p>}
      {!data || data.days !== days ? (
        <p className="muted">Loading insights…</p>
      ) : (
        <>
          <div className="overview-summary">
            <div>
              <span>Quotations</span>
              <strong>{data.totals.quotes}</strong>
              <small className="muted">{money(data.totals.value)} quoted</small>
            </div>
            <div>
              <span>Won</span>
              <strong>{data.totals.won ?? 0}</strong>
              <small className="muted">{money(data.totals.wonValue)}</small>
            </div>
            <div>
              <span>Team active today</span>
              <strong>
                {data.team.activeToday ?? 0}
                <small>/ {data.team.active ?? 0}</small>
              </strong>
            </div>
            <div>
              <span>Catalogue views</span>
              <strong>{data.views}</strong>
            </div>
          </div>
          <section className="work-section">
            <div className="work-section-title">
              <h2>Quotations per day</h2>
            </div>
            <DailyChart daily={data.daily} days={data.days} />
          </section>
          <div className="admin-grid">
            <section className="work-section">
              <div className="work-section-title">
                <h2>By salesperson</h2>
              </div>
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th scope="col">Salesperson</th>
                    <th scope="col" className="num">
                      Quotes
                    </th>
                    <th scope="col" className="num">
                      Won
                    </th>
                    <th scope="col" className="num">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.byPerson.map((p) => (
                    <tr key={p.id + p.name}>
                      <td>{p.name}</td>
                      <td className="num">{p.quotes}</td>
                      <td className="num">{p.won}</td>
                      <td className="num">{money(p.value)}</td>
                    </tr>
                  ))}
                  {!data.byPerson.length && (
                    <tr>
                      <td colSpan={4} className="muted">
                        No quotations in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
            <section className="work-section">
              <div className="work-section-title">
                <h2>Most quoted products</h2>
              </div>
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col" className="num">
                      Quotes
                    </th>
                    <th scope="col" className="num">
                      Units
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.topQuoted.map((p) => (
                    <tr key={p.productId}>
                      <td>
                        {p.name}
                        <small className="muted block">{p.code}</small>
                      </td>
                      <td className="num">{p.quotes}</td>
                      <td className="num">{p.quantity}</td>
                    </tr>
                  ))}
                  {!data.topQuoted.length && (
                    <tr>
                      <td colSpan={3} className="muted">
                        No quoted products yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
            <section className="work-section">
              <div className="work-section-title">
                <h2>Most viewed products</h2>
              </div>
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col" className="num">
                      Views
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.topViewed.map((p) => (
                    <tr key={p.productId}>
                      <td>
                        {p.name}
                        <small className="muted block">{p.code}</small>
                      </td>
                      <td className="num">{p.views}</td>
                    </tr>
                  ))}
                  {!data.topViewed.length && (
                    <tr>
                      <td colSpan={2} className="muted">
                        No views recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
            <section className="work-section">
              <div className="work-section-title">
                <h2>Stock position</h2>
              </div>
              <dl className="stat-list">
                <div>
                  <dt>Stock value at cost</dt>
                  <dd>
                    {money(data.stock.costValue)}
                    {data.stock.uncosted > 0 && (
                      <small className="muted block">
                        {data.stock.uncosted} stocked products have no cost
                      </small>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Stock value at MRP</dt>
                  <dd>{money(data.stock.mrpValue)}</dd>
                </div>
                <div>
                  <dt>Out of stock / low</dt>
                  <dd>
                    {data.stock.out ?? 0} / {data.stock.low ?? 0}
                  </dd>
                </div>
                <div>
                  <dt>Missing photo / price</dt>
                  <dd>
                    {data.stock.noPhoto ?? 0} / {data.stock.noPrice ?? 0}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
function DailyChart({
  daily,
  days,
}: {
  daily: Analytics["daily"];
  days: number;
}) {
  const [now] = useState(() => Date.now());
  const series = useMemo(() => {
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const count = Math.min(days, 90);
    return Array.from({ length: count }, (_, i) => {
      const day = new Date(now - (count - 1 - i) * 86400000)
        .toISOString()
        .slice(0, 10);
      return {
        day,
        quotes: byDay.get(day)?.quotes ?? 0,
        value: byDay.get(day)?.value ?? 0,
      };
    });
  }, [daily, days, now]);
  const max = Math.max(1, ...series.map((s) => s.quotes));
  const W = 720,
    H = 160,
    gap = 2,
    bar = Math.max(2, W / series.length - gap);
  return (
    <figure className="daily-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Quotations per day, last ${series.length} days, peak ${max}`}
      >
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="axis" />
        {series.map((s, i) => {
          const h = (s.quotes / max) * (H - 8);
          const x = i * (bar + gap);
          return (
            <g key={s.day} className="bar-hit">
              <rect x={x} y={0} width={bar + gap} height={H} className="hit" />
              {s.quotes > 0 && (
                <rect
                  className="bar"
                  x={x}
                  y={H - h}
                  width={bar}
                  height={h}
                  rx={2}
                />
              )}
              <title>{`${s.day}: ${s.quotes} quotations, ${money(s.value)}`}</title>
            </g>
          );
        })}
      </svg>
      <figcaption>
        <span>{series[0]?.day}</span>
        <span>Peak {max} per day</span>
        <span>{series.at(-1)?.day}</span>
      </figcaption>
    </figure>
  );
}

/* ───────── Quotations ───────── */
export function QuotationsPanel({ team }: { team?: TeamMember[] }) {
  const [rows, setRows] = useState<Quotation[] | null>(null);
  const [members, setMembers] = useState<TeamMember[]>(team ?? []);
  const [status, setStatus] = useState("");
  const [by, setBy] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api<TeamMember[]>("/admin/team")
      .then(setMembers)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(
      Object.entries({ status, by, q, from, to }).filter(([, v]) => v),
    );
    const timer = setTimeout(() => {
      api<Quotation[]>(`/admin/quotations?${params}`)
        .then((r) => {
          setRows(r);
          setError("");
        })
        .catch((e) => setError(errorMessage(e)));
    }, 250);
    return () => clearTimeout(timer);
  }, [status, by, q, from, to]);
  return (
    <div className="admin-stack">
      <div className="table-tools">
        <div className="filter-tabs" role="group" aria-label="Status">
          {["", "draft", "sent", "won", "lost"].map((s) => (
            <button
              key={s}
              className={status === s ? "selected" : ""}
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
            >
              {s ? s[0].toUpperCase() + s.slice(1) : "All"}
            </button>
          ))}
        </div>
        <label className="search">
          <input
            placeholder="Number, customer or salesperson"
            aria-label="Search quotations"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>
      <div className="table-secondary-tools">
        <label>
          Salesperson
          <select value={by} onChange={(e) => setBy(e.target.value)}>
            <option value="">Everyone</option>
            <option value="owner">Owner</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="button"
          disabled={!rows?.length}
          onClick={() =>
            downloadCsv(
              `Lenore-quotations-${new Date().toISOString().slice(0, 10)}.csv`,
              [
                [
                  "Number",
                  "Date",
                  "Status",
                  "Customer",
                  "Phone",
                  "Place",
                  "Salesperson",
                  "Products",
                  "MRP total",
                  "Discount",
                  "Total",
                  "Valid until",
                  "Revision",
                ],
                ...(rows ?? []).map((r) => [
                  r.number,
                  r.createdAt.slice(0, 10),
                  r.status,
                  r.customerName,
                  r.customerPhone,
                  r.customerPlace,
                  r.createdByName,
                  r.itemCount,
                  r.mrpTotalPaise === null
                    ? ""
                    : (r.mrpTotalPaise / 100).toFixed(2),
                  r.discountPaise === null
                    ? ""
                    : (r.discountPaise / 100).toFixed(2),
                  r.totalPaise === null ? "" : (r.totalPaise / 100).toFixed(2),
                  r.validUntil,
                  r.version,
                ]),
              ],
            )
          }
        >
          <Download size={16} /> Export CSV
        </button>
      </div>
      {error && <p className="error banner">{error}</p>}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Quotation</th>
              <th scope="col">Customer</th>
              <th scope="col">Salesperson</th>
              <th scope="col" className="num">
                Total
              </th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.number}</strong>
                  <small className="muted block">
                    {when(r.createdAt)} · {r.itemCount} products
                    {r.version > 1 && ` · rev ${r.version}`}
                  </small>
                </td>
                <td>
                  {r.customerName}
                  <small className="muted block">
                    {[r.customerPlace, r.customerPhone]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </td>
                <td>{r.createdByName}</td>
                <td className="num">
                  {r.totalPaise === null ? "To confirm" : money(r.totalPaise)}
                  {!!r.discountPaise && (
                    <small className="muted block">
                      −{money(r.discountPaise)}
                    </small>
                  )}
                </td>
                <td>
                  <span
                    className={`badge ${r.status === "won" ? "live" : r.status === "lost" ? "out" : r.status === "sent" ? "low" : "draft"}`}
                  >
                    {r.status}
                  </span>
                </td>
                <td>
                  <a
                    className="row-action"
                    href={`/q/${r.shareToken}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </td>
              </tr>
            ))}
            {rows && !rows.length && (
              <tr>
                <td colSpan={6} className="muted">
                  No quotations match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────── Team ───────── */
export function TeamPanel({ notify }: { notify: (m: string) => void }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [editing, setEditing] = useState<TeamMember | "new" | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    api<TeamMember[]>("/admin/team")
      .then(setMembers)
      .catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="admin-stack">
      <div className="table-secondary-tools">
        <p className="muted">
          Team members sign in to the catalogue with their phone number. Admins
          can also open this workspace. Deactivating someone signs them out at
          once.
        </p>
        <button className="button dark" onClick={() => setEditing("new")}>
          Add team member
        </button>
      </div>
      {error && <p className="error banner">{error}</p>}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Phone</th>
              <th scope="col">Role</th>
              <th scope="col">Discount limit</th>
              <th scope="col">Last active</th>
              <th scope="col" className="num">
                Quotes
              </th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.id} className={m.active ? "" : "inactive"}>
                <td>
                  <strong>{m.name}</strong>
                  {!m.active && <span className="badge out">Inactive</span>}
                </td>
                <td>+{m.phone}</td>
                <td>{m.role === "admin" ? "Admin" : "Salesperson"}</td>
                <td>
                  {m.maxDiscountBp === null
                    ? "Workspace default"
                    : percent(m.maxDiscountBp)}
                </td>
                <td>{when(m.lastActiveAt)}</td>
                <td className="num">{m.quoteCount}</td>
                <td>
                  <button className="row-action" onClick={() => setEditing(m)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {members && !members.length && (
              <tr>
                <td colSpan={7} className="muted">
                  No team members yet. Add your salespeople so they can sign in.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <TeamEditor
          member={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            notify(message);
            void load();
          }}
        />
      )}
    </div>
  );
}
function TeamEditor({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [role, setRole] = useState<"admin" | "sales">(member?.role ?? "sales");
  const [cap, setCap] = useState(
    member?.maxDiscountBp == null ? "" : String(member.maxDiscountBp / 100),
  );
  const [active, setActive] = useState(member?.active ?? true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Overlay onClose={() => !busy && onClose()}>
      <div className="panel-shade" onClick={() => !busy && onClose()}>
        <section
          className="editor-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="team-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="panel-heading">
            <h2 id="team-title">
              {member ? "Edit team member" : "Add team member"}
            </h2>
            <button
              className="icon-button"
              aria-label="Close"
              onClick={onClose}
            >
              <X />
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const maxDiscountBp =
                cap.trim() === "" ? null : Math.round(Number(cap) * 100);
              try {
                if (member) {
                  await api(
                    `/admin/team/${member.id}`,
                    {
                      name,
                      role,
                      active,
                      maxDiscountBp,
                      password,
                      revision: member.revision,
                    },
                    "PUT",
                  );
                  onSaved(`${name} updated.`);
                } else {
                  await api(
                    "/admin/team",
                    { name, phone, role, maxDiscountBp, password },
                    "POST",
                  );
                  onSaved(
                    `${name} can now sign in with +${phone.replace(/\D/g, "")}.`,
                  );
                }
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Name
              <input
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Phone number (sign-in ID)
              <input
                required
                type="tel"
                disabled={!!member}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
              />
            </label>
            <div className="form-row">
              <label>
                Role
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "admin" | "sales")}
                >
                  <option value="sales">Salesperson</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label>
                Discount limit %
                <input
                  inputMode="decimal"
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  placeholder="Workspace default"
                />
              </label>
            </div>
            <label>
              {member
                ? "New password (leave blank to keep)"
                : "Temporary password"}
              <input
                type="text"
                autoComplete="new-password"
                minLength={member ? 0 : 8}
                required={!member}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {member && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                <span>
                  <strong>Active</strong>
                  <small>
                    Inactive members cannot sign in; existing sessions end
                    immediately.
                  </small>
                </span>
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              {member && (
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={async () => {
                    await api(
                      `/admin/team/${member.id}/sign-out`,
                      {},
                      "POST",
                    ).catch(() => undefined);
                    onSaved(`${member.name} was signed out of all devices.`);
                  }}
                >
                  Sign out devices
                </button>
              )}
              <button className="button dark" disabled={busy}>
                {busy ? "Saving…" : "Save"} <Check size={16} />
              </button>
            </div>
          </form>
        </section>
      </div>
    </Overlay>
  );
}

/* ───────── Access and pricing ───────── */
export function AccessPanel({ notify }: { notify: (m: string) => void }) {
  const [access, setAccess] = useState<{
    mode: AccessMode;
    hasPassword: boolean;
    revision: number;
  } | null>(null);
  const [mode, setMode] = useState<AccessMode>("public");
  const [password, setPassword] = useState("");
  const [config, setConfig] = useState<{
    whatsapp: string;
    pricingMode: PricingMode;
    discountCapBp: number;
    quoteValidityDays: number;
    quoteTerms: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api<{ mode: AccessMode; hasPassword: boolean; revision: number }>(
        "/admin/catalogue-access",
      ),
      api<NonNullable<typeof config>>("/config"),
    ])
      .then(([a, c]) => {
        setAccess(a);
        setMode(a.mode);
        setConfig(c);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (!access || !config)
    return <p className="muted">{error || "Loading settings…"}</p>;
  return (
    <div className="settings-grid">
      <section className="work-section settings-section">
        <h2>Who can open the catalogue</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              const next = await api<typeof access>(
                "/admin/catalogue-access",
                {
                  mode,
                  revision: access.revision,
                  ...(password ? { password } : {}),
                },
                "PUT",
              );
              setAccess(next);
              setPassword("");
              notify("Catalogue access saved.");
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <fieldset className="choice-list">
            <legend className="visually-hidden">Access mode</legend>
            {(
              [
                [
                  "public",
                  "Public",
                  "Anyone can browse. Visitors see MRP and stock status, never exact quantities.",
                ],
                [
                  "password",
                  "Shared team password",
                  "One password for approved salespeople. Team accounts also work.",
                ],
                [
                  "accounts",
                  "Team accounts only",
                  "Only people you add under Team can sign in.",
                ],
              ] as [AccessMode, string, string][]
            ).map(([value, label, help]) => (
              <label key={value} className="checkbox-label">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{help}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {mode === "password" && (
            <label>
              {access.hasPassword
                ? "Change shared password (optional)"
                : "Shared password"}
              <input
                type="text"
                autoComplete="new-password"
                minLength={6}
                required={!access.hasPassword}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            {access.mode === "password" && (
              <button
                type="button"
                className="button"
                onClick={async () => {
                  try {
                    setAccess(
                      await api(
                        "/admin/catalogue-access/revoke",
                        { revision: access.revision },
                        "POST",
                      ),
                    );
                    notify(
                      "Everyone using the shared password has been signed out.",
                    );
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                Sign out shared devices
              </button>
            )}
            <button className="button dark">Save access</button>
          </div>
        </form>
      </section>
      <section className="work-section settings-section">
        <h2>Quotation pricing</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              const {
                whatsapp,
                pricingMode,
                discountCapBp,
                quoteValidityDays,
                quoteTerms,
              } = config;
              await api(
                "/admin/settings",
                {
                  whatsapp,
                  pricingMode,
                  discountCapBp,
                  quoteValidityDays,
                  quoteTerms,
                },
                "PUT",
              );
              notify("Quotation settings saved.");
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <fieldset className="choice-list">
            <legend className="visually-hidden">Pricing policy</legend>
            {(
              [
                ["mrp", "MRP only", "Salespeople cannot discount."],
                [
                  "capped",
                  "Discount up to a limit",
                  "Per-line discounts up to the limit below, or each person's own limit.",
                ],
                [
                  "free",
                  "Any price up to MRP",
                  "Salespeople may enter any price, never above MRP.",
                ],
              ] as [PricingMode, string, string][]
            ).map(([value, label, help]) => (
              <label key={value} className="checkbox-label">
                <input
                  type="radio"
                  name="pricing"
                  checked={config.pricingMode === value}
                  onChange={() => setConfig({ ...config, pricingMode: value })}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{help}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="form-row">
            <label>
              Default discount limit %
              <input
                inputMode="decimal"
                value={config.discountCapBp / 100}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    discountCapBp: Math.max(
                      0,
                      Math.min(
                        10000,
                        Math.round(Number(e.target.value || 0) * 100),
                      ),
                    ),
                  })
                }
              />
            </label>
            <label>
              Quotation validity (days)
              <input
                type="number"
                min={1}
                max={365}
                value={config.quoteValidityDays}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    quoteValidityDays: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label>
            Terms printed on quotations
            <textarea
              rows={4}
              maxLength={2000}
              value={config.quoteTerms}
              onChange={(e) =>
                setConfig({ ...config, quoteTerms: e.target.value })
              }
            />
          </label>
          <label>
            Lenore WhatsApp number
            <input
              type="tel"
              value={config.whatsapp}
              onChange={(e) =>
                setConfig({
                  ...config,
                  whatsapp: e.target.value.replace(/\D/g, ""),
                })
              }
              placeholder="917511163131"
            />
            <small className="muted">
              Country code and digits. Used for website enquiries; blank uses
              the showroom phone.
            </small>
          </label>
          <div className="form-actions">
            <button className="button dark">Save pricing</button>
          </div>
        </form>
      </section>
    </div>
  );
}

/* ───────── Inventory tools ───────── */
type Movement = {
  id: string;
  kind: MovementKind;
  delta: number;
  previousStock: number;
  newStock: number;
  reason: string;
  actor: string;
  createdAt: string;
};
export function StockLedger({ product }: { product: Product }) {
  const [rows, setRows] = useState<Movement[] | null>(null);
  useEffect(() => {
    api<Movement[]>(`/admin/products/${product.id}/movements`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [product.id, product.revision]);
  return (
    <div className="ledger">
      <div className="ledger-head">
        <h3>Movement history</h3>
        {!!rows?.length && (
          <button
            type="button"
            className="row-action"
            onClick={() =>
              downloadCsv(`Lenore-${product.code}-movements.csv`, [
                ["Date", "Type", "Change", "Before", "After", "Reason", "By"],
                ...rows.map((r) => [
                  r.createdAt,
                  movementLabel[r.kind] ?? r.kind,
                  r.delta,
                  r.previousStock,
                  r.newStock,
                  r.reason,
                  r.actor,
                ]),
              ])
            }
          >
            Export
          </button>
        )}
      </div>
      {!rows ? (
        <p className="muted">Loading…</p>
      ) : !rows.length ? (
        <p className="muted">No movements yet.</p>
      ) : (
        <ol>
          {rows.slice(0, 50).map((r) => (
            <li key={r.id}>
              <span className={r.delta > 0 ? "delta up" : "delta down"}>
                {r.delta > 0 ? `+${r.delta}` : r.delta}
              </span>
              <span>
                <strong>{movementLabel[r.kind] ?? r.kind}</strong> ·{" "}
                {r.previousStock} → {r.newStock}
                <small className="muted block">
                  {r.reason} · {r.actor} · {when(r.createdAt)}
                </small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function StockCount({
  products,
  onClose,
  onSaved,
}: {
  products: Product[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("Stock count");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [operationId] = useState(() => crypto.randomUUID());
  const snapshot = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const entered = Object.entries(counts).filter(([, v]) => v !== "");
  const differences = entered.filter(
    ([id, v]) => Number(v) !== snapshot.get(id)?.stock,
  );
  const shown = products.filter((p) =>
    `${p.code} ${p.name} ${p.barcode} ${p.bin}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <Overlay onClose={() => !busy && onClose()}>
      <div className="panel-shade" onClick={() => !busy && onClose()}>
        <section
          className="editor-panel wide-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="count-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="panel-heading">
            <h2 id="count-title">Stock count</h2>
            <button
              className="icon-button"
              aria-label="Close"
              onClick={onClose}
            >
              <X />
            </button>
          </div>
          <p className="muted">
            Scan or search, type what is on the shelf, then post all corrections
            together. If stock changes while you count, those products must be
            recounted.
          </p>
          <label className="search">
            <input
              autoFocus
              placeholder="Scan barcode or search code, name, bin"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const exact = products.find(
                  (p) =>
                    p.barcode === q.trim() ||
                    p.code.toLowerCase() === q.trim().toLowerCase(),
                );
                if (exact)
                  setCounts((c) => ({
                    ...c,
                    [exact.id]: String(Number(c[exact.id] || 0) + 1),
                  }));
                setQ("");
              }}
            />
          </label>
          <div className="data-table-wrap count-table">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Bin</th>
                  <th scope="col" className="num">
                    System
                  </th>
                  <th scope="col" className="num">
                    Counted
                  </th>
                  <th scope="col" className="num">
                    Difference
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 300).map((p) => {
                  const v = counts[p.id] ?? "";
                  const diff = v === "" ? null : Number(v) - p.stock;
                  return (
                    <tr key={p.id}>
                      <td>
                        {p.name}
                        <small className="muted block">{p.code}</small>
                      </td>
                      <td>{p.bin || "—"}</td>
                      <td className="num">{p.stock}</td>
                      <td className="num">
                        <input
                          className="count-input"
                          inputMode="numeric"
                          aria-label={`Counted quantity for ${p.code}`}
                          value={v}
                          onChange={(e) =>
                            setCounts((c) => ({
                              ...c,
                              [p.id]: e.target.value.replace(/\D/g, ""),
                            }))
                          }
                        />
                      </td>
                      <td
                        className={`num ${diff ? (diff > 0 ? "delta up" : "delta down") : ""}`}
                      >
                        {diff === null ? "" : diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <label>
            Reason
            <input
              value={reason}
              minLength={3}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <span className="muted">
              {entered.length} counted · {differences.length} differences
            </span>
            <button
              className="button dark"
              disabled={busy || !entered.length || reason.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await api<{ corrected: number }>(
                    "/admin/stock-count",
                    {
                      operationId,
                      reason,
                      lines: entered.map(([id, v]) => ({
                        productId: id,
                        revision: snapshot.get(id)!.revision,
                        counted: Number(v),
                      })),
                    },
                    "POST",
                  );
                  onSaved(`Stock count posted: ${r.corrected} corrections.`);
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Posting…" : "Post count"}
            </button>
          </div>
        </section>
      </div>
    </Overlay>
  );
}

const importColumns = [
  "code",
  "name",
  "category",
  "unit",
  "description",
  "mrp",
  "lowStock",
  "published",
  "hsn",
  "gstRate",
  "barcode",
  "reorderQty",
  "bin",
  "cost",
  "openingStock",
];
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
const paise = (v: string) =>
  v.trim() === "" ? null : Math.round(Number(v.replace(/[₹,\s]/g, "")) * 100);
export function ImportProducts({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (m: string) => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [preview, setPreview] = useState<{
    created: number;
    updated: number;
    unchanged: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(dryRun: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{
        created: number;
        updated: number;
        unchanged: number;
      }>("/admin/products/import", { rows, dryRun }, "POST");
      if (dryRun) setPreview(r);
      else
        onSaved(
          `Import complete: ${r.created} added, ${r.updated} updated, ${r.unchanged} unchanged.`,
        );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Overlay onClose={() => !busy && onClose()}>
      <div className="panel-shade" onClick={() => !busy && onClose()}>
        <section
          className="editor-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="panel-heading">
            <h2 id="import-title">Import products</h2>
            <button
              className="icon-button"
              aria-label="Close"
              onClick={onClose}
            >
              <X />
            </button>
          </div>
          <p className="muted">
            Upload a CSV (save Excel as CSV). The product code is the key:
            existing codes are updated, new codes are added. Stock only changes
            through <em>openingStock</em> for new products. Up to 500 rows.
          </p>
          <button
            type="button"
            className="button"
            onClick={() =>
              downloadCsv("Lenore-product-template.csv", [
                importColumns,
                [
                  "L-1001",
                  "Single lever basin mixer",
                  "Basin mixers",
                  "pcs",
                  "Chrome finish",
                  "4500",
                  "5",
                  "yes",
                  "8481",
                  "18",
                  "8901234567890",
                  "10",
                  "A-01",
                  "2800",
                  "12",
                ],
              ])
            }
          >
            <Download size={16} /> Download template
          </button>
          <label className="upload-field">
            <Upload size={22} />
            <strong>
              {rows ? `${rows.length} rows ready` : "Choose CSV file"}
            </strong>
            <span>Columns: {importColumns.join(", ")}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                setPreview(null);
                setError("");
                const file = e.target.files?.[0];
                if (!file) return;
                const table = parseCsv(await file.text());
                const head = table.shift()?.map((h) => h.trim()) ?? [];
                const missing = ["code", "name", "category"].filter(
                  (c) => !head.includes(c),
                );
                if (missing.length)
                  return setError(`Missing columns: ${missing.join(", ")}`);
                const get = (r: string[], k: string) =>
                  (r[head.indexOf(k)] ?? "").trim();
                try {
                  setRows(
                    table.map((r) => ({
                      code: get(r, "code"),
                      name: get(r, "name"),
                      category: get(r, "category"),
                      unit: get(r, "unit") || "pcs",
                      description: get(r, "description"),
                      pricePaise: paise(get(r, "mrp")),
                      lowStock: Number(get(r, "lowStock") || 5),
                      published: /^(yes|true|1|published)$/i.test(
                        get(r, "published"),
                      ),
                      hsn: get(r, "hsn"),
                      gstRateBp:
                        get(r, "gstRate") === ""
                          ? null
                          : Math.round(Number(get(r, "gstRate")) * 100),
                      barcode: get(r, "barcode"),
                      reorderQty: Number(get(r, "reorderQty") || 0),
                      bin: get(r, "bin"),
                      costPaise: paise(get(r, "cost")),
                      openingStock: Number(get(r, "openingStock") || 0),
                    })),
                  );
                } catch {
                  setError("The file could not be read.");
                }
              }}
            />
          </label>
          {preview && (
            <p className="success banner">
              Preview: {preview.created} new, {preview.updated} updated,{" "}
              {preview.unchanged} unchanged.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button"
              disabled={!rows || busy}
              onClick={() => send(true)}
            >
              Check file
            </button>
            <button
              className="button dark"
              disabled={!preview || busy}
              onClick={() => send(false)}
            >
              {busy ? "Importing…" : "Import"}
            </button>
          </div>
        </section>
      </div>
    </Overlay>
  );
}

/** Bulk photos: each file named by product code (e.g. L-1001.jpg). */
export function BulkPhotos({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (m: string) => void;
}) {
  const [results, setResults] = useState<
    { name: string; ok: boolean; message: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  return (
    <Overlay onClose={() => !busy && onClose()}>
      <div className="panel-shade" onClick={() => !busy && onClose()}>
        <section
          className="editor-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="photos-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="panel-heading">
            <h2 id="photos-title">Upload photos by code</h2>
            <button
              className="icon-button"
              aria-label="Close"
              onClick={onClose}
            >
              <X />
            </button>
          </div>
          <p className="muted">
            Name each file with its product code, for example{" "}
            <code>L-1001.jpg</code>. Add <code>_spec</code> for a specification
            poster: <code>L-1001_spec.png</code>.
          </p>
          <label className="upload-field">
            <Upload size={22} />
            <strong>{busy ? "Uploading…" : "Choose images"}</strong>
            <span>JPEG, PNG or WebP · up to 5 MB each</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])];
                setBusy(true);
                const out: typeof results = [];
                for (const file of files) {
                  const base = file.name.replace(/\.[^.]+$/, "");
                  const poster = /_spec$/i.test(base);
                  const code = base.replace(/_spec$/i, "");
                  const r = await fetch(
                    `/api/admin/media/by-code?code=${encodeURIComponent(code)}&slot=${poster ? "poster" : "photo"}`,
                    {
                      method: "POST",
                      body: file,
                    },
                  );
                  const body = (await r.json().catch(() => ({}))) as {
                    error?: string;
                  };
                  out.push({
                    name: file.name,
                    ok: r.ok,
                    message: r.ok
                      ? `${poster ? "Poster" : "Photo"} for ${code}`
                      : (body.error ?? "Failed"),
                  });
                  setResults([...out]);
                }
                setBusy(false);
                onSaved(
                  `${out.filter((r) => r.ok).length} of ${out.length} images uploaded.`,
                );
              }}
            />
          </label>
          <ul className="upload-results">
            {results.map((r) => (
              <li key={r.name} className={r.ok ? "ok" : "fail"}>
                {r.ok ? <Check size={14} /> : <X size={14} />} {r.name} —{" "}
                {r.message}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Overlay>
  );
}

/** A4 sheet of barcode labels (Code 128) via the print dialog. */
export function LabelSheet({
  products,
  onClose,
}: {
  products: Product[];
  onClose: () => void;
}) {
  const [copies, setCopies] = useState(1);
  const labels = products.flatMap((p) =>
    Array.from({ length: copies }, () => p),
  );
  return (
    <Overlay onClose={onClose}>
      <div className="label-print">
        <div className="label-toolbar no-print">
          <strong>
            {labels.length} labels · {products.length} products
          </strong>
          <label>
            Copies each
            <input
              type="number"
              min={1}
              max={50}
              value={copies}
              onChange={(e) =>
                setCopies(Math.max(1, Math.min(50, Number(e.target.value))))
              }
            />
          </label>
          <button className="button dark" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
          <button className="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="label-grid">
          {labels.map((p, i) => (
            <div className="label" key={`${p.id}-${i}`}>
              <strong>{p.name}</strong>
              <span>
                {p.code}
                {p.bin && ` · ${p.bin}`}
              </span>
              <Barcode value={p.barcode || p.code} />
              <b>{money(p.pricePaise)}</b>
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  );
}

/** Minimal Code 128-B encoder rendered as SVG bars. */
const CODE128 =
  "212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,221312,231212,112232,122132,122231,113222,123122,123221,223211,221132,221231,213212,223112,312131,311222,321122,321221,312212,322112,322211,212123,212321,232121,111323,131123,131321,112313,132113,132311,211313,231113,231311,112133,112331,132131,113123,113321,133121,313121,211331,231131,213113,213311,213131,311123,311321,331121,312113,312311,332111,314111,221411,431111,111224,111422,121124,121421,141122,141221,112214,112412,122114,122411,142112,142211,241211,221114,413111,241112,134111,111242,121142,121241,114212,124112,124211,411212,421112,421211,212141,214121,412121,111143,111341,131141,114113,114311,411113,411311,113141,114131,311141,411131,211412,211214,211232,2331112".split(
    ",",
  );
function Barcode({ value }: { value: string }) {
  const text = value.replace(/[^\x20-\x7e]/g, "").slice(0, 40);
  const codes = [104, ...[...text].map((c) => c.charCodeAt(0) - 32)];
  const check = codes.reduce((sum, c, i) => sum + c * (i || 1), 0) % 103;
  const pattern = [...codes, check, 106].map((c) => CODE128[c]).join("");
  let x = 10;
  const bars: { x: number; w: number }[] = [];
  [...pattern].forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w: Number(w) });
    x += Number(w);
  });
  return (
    <svg
      className="barcode"
      viewBox={`0 0 ${x + 10} 40`}
      role="img"
      aria-label={`Barcode ${text}`}
    >
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={40} />
      ))}
    </svg>
  );
}
