import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Plus,
  Download,
  RefreshCw,
  X,
  ArrowUpRight,
  FileUp,
} from "lucide-react";
import { api, errorMessage } from "./api";
import { Overlay } from "./overlay";
import {
  amountFromText,
  documentInput,
  financeKinds,
  kindLabel,
  financeMoney as fm,
  financeCsvHeaders,
  parseFinanceCsv,
  profileInput,
  obligationInput,
  type FinanceDocument,
  type FinanceInput,
  type FinanceProfile,
  type FinanceSettlement,
  type FinanceSummary,
  type TaxObligation,
} from "../finance";
import "./finance.css";

type Workspace = {
  profile: FinanceProfile;
  summary: FinanceSummary;
  documents: FinanceDocument[];
  settlements: FinanceSettlement[];
  balances: FinanceDocument[];
  obligations: TaxObligation[];
  audit: {
    id: number;
    entity_id: string;
    action: string;
    detail: string;
    created_at: string;
  }[];
  from: string;
  to: string;
};
const now = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const tabs = [
  ["summary", "Summary"],
  ["documents", "Registers"],
  ["balances", "Receivables & payables"],
  ["tax", "GST workbook"],
  ["exports", "Exports"],
  ["tasks", "Tax tasks"],
  ["audit", "Audit"],
  ["setup", "Setup"],
] as const;
const field = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const amt = (f: FormData, key: string) => amountFromText(field(f, key) || "0");
const decimal = (v: number) => (v / 100).toFixed(2);
const tax = (d: FinanceInput) => d.cgstMinor + d.sgstMinor + d.igstMinor;
function saveCsv(content: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Field({
  label,
  name,
  value,
  type = "text",
  required = false,
  ...rest
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  min?: string;
  step?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        defaultValue={value}
        type={type}
        required={required}
        {...rest}
      />
    </label>
  );
}
function MoneyField({
  label,
  name,
  value,
  required = false,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
}) {
  return (
    <Field
      label={label}
      name={name}
      value={value}
      type="text"
      required={required}
      maxLength={20}
    />
  );
}
function Panel({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <Overlay onClose={close}>
      <div className="panel-shade" onClick={close}>
        <section
          className="editor-panel finance-panel"
          aria-label={title}
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="panel-heading">
            <h2>{title}</h2>
            <button
              autoFocus
              className="icon-button"
              aria-label="Close finance panel"
              onClick={close}
            >
              <X size={19} />
            </button>
          </div>
          {children}
        </section>
      </div>
    </Overlay>
  );
}
function SourceForm({
  profile,
  source,
  save,
  close,
}: {
  profile: FinanceProfile;
  source?: FinanceDocument;
  save: (d: FinanceInput) => Promise<void>;
  close: () => void;
}) {
  const [kind, setKind] = useState<FinanceInput["kind"]>(
    source?.kind === "sale"
      ? "sale_credit"
      : source?.kind === "purchase" || source?.kind === "expense"
        ? "purchase_credit"
        : "sale",
  );
  const [supply, setSupply] = useState<FinanceInput["supply"]>(
    source?.supply ?? "non_gst",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const rounding = field(f, "rounding") || "0";
      const d = documentInput.parse({
        id: requestId.current,
        kind,
        date: field(f, "date"),
        dueDate: field(f, "dueDate"),
        number: field(f, "number"),
        party: field(f, "party"),
        gstin: field(f, "gstin"),
        category: field(f, "category"),
        netMinor: amt(f, "net"),
        freightMinor: amt(f, "freight"),
        roundingMinor:
          (rounding.startsWith("-") ? -1 : 1) *
          amountFromText(rounding.replace(/^[-+]/, "")),
        cgstMinor: amt(f, "cgst"),
        sgstMinor: amt(f, "sgst"),
        igstMinor: amt(f, "igst"),
        costMinor:
          ["sale", "sale_credit"].includes(kind) && field(f, "cost") !== ""
            ? amt(f, "cost")
            : null,
        itcStatus: "pending",
        reviewNote: "",
        parentId: source?.id ?? null,
        source: "manual",
        notes: field(f, "notes"),
        export: supply.startsWith("export")
          ? {
              country: field(f, "country").toUpperCase(),
              currency: field(f, "currency"),
              foreignGrossMinor: amt(f, "foreignGross"),
              rateEvidence: field(f, "rateEvidence"),
              lut: field(f, "lut"),
              shippingBill: field(f, "shippingBill"),
              shippingDate: field(f, "shippingDate") || null,
              port: field(f, "port"),
              realisationDue: field(f, "realisationDue"),
            }
          : null,
      });
      await save(d);
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title={source ? "Record credit note" : "Record source document"}
      close={close}
    >
      <p className="finance-help">
        Enter an already-issued invoice or bill. This records finance only; it
        does not issue an invoice or move stock. Amounts are INR, taken from the
        source.
      </p>
      <form onSubmit={submit}>
        {source ? (
          <p className="finance-source-ref">
            Against {source.number} · {source.party}
          </p>
        ) : (
          <label>
            Document type
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="sale">Sale invoice</option>
              <option value="purchase">Purchase bill</option>
              <option value="expense">Operating expense</option>
            </select>
          </label>
        )}
        <div className="form-row">
          <Field
            label="Source document number"
            name="number"
            required
            maxLength={100}
          />
          <Field
            label="Category"
            name="category"
            value={
              source?.category ??
              (kind === "expense" ? "General expense" : "Trading")
            }
            required
            maxLength={80}
          />
        </div>
        <Field
          label="Customer / supplier"
          name="party"
          value={source?.party}
          required
          maxLength={160}
        />
        <Field
          label="Party GSTIN, if registered"
          name="gstin"
          value={source?.gstin}
          maxLength={15}
        />
        <div className="form-row">
          <Field
            label="Document date"
            name="date"
            type="date"
            value={now()}
            required
          />
          <Field
            label="Payment due date"
            name="dueDate"
            type="date"
            value={now()}
            required
          />
        </div>
        <h3>Source amounts · INR</h3>
        <p className="finance-help">
          Copy the actual tax split and rounding. No tax rate or exchange rate
          is assumed.
        </p>
        <label>
          Tax treatment
          <select
            value={supply}
            disabled={!!source}
            onChange={(e) => setSupply(e.target.value as typeof supply)}
          >
            <option value="non_gst">No GST recorded</option>
            <option value="domestic_intra">Domestic · CGST + SGST</option>
            <option value="domestic_inter">Domestic · IGST</option>
            {["sale", "sale_credit"].includes(kind) && (
              <>
                <option value="export_lut">Export · LUT / bond, no IGST</option>
                <option value="export_igst">Export · IGST recorded</option>
              </>
            )}
          </select>
        </label>
        <MoneyField
          label="Net source value, excluding GST"
          name="net"
          required
        />
        <div className="form-row">
          <MoneyField
            label="Freight charged on source"
            name="freight"
            value="0.00"
          />
          <MoneyField
            label="Source round-off (+ / −, max ₹1)"
            name="rounding"
            value="0.00"
          />
        </div>
        {supply === "domestic_intra" && (
          <div className="form-row">
            <MoneyField label="CGST" name="cgst" required />
            <MoneyField label="SGST" name="sgst" required />
          </div>
        )}
        {["domestic_inter", "export_igst"].includes(supply) && (
          <MoneyField label="IGST" name="igst" required />
        )}
        {["sale", "sale_credit"].includes(kind) && (
          <>
            <MoneyField
              label="Cost of goods sold / returned, if verified"
              name="cost"
            />
            <p className="finance-help">
              Leave blank when unknown. Profit stays unavailable until verified
              cost is recorded; purchase totals are not a substitute.
            </p>
          </>
        )}
        {supply.startsWith("export") && (
          <>
            <h3>Export evidence</h3>
            <div className="form-row">
              <Field
                label="Destination country code (QA / AE, etc.)"
                name="country"
                value={source?.export?.country}
                required
                maxLength={2}
              />
              <label>
                Original currency
                <select
                  name="currency"
                  defaultValue={source?.export?.currency ?? "USD"}
                >
                  {["INR", "USD", "AED", "QAR", "SAR", "EUR", "GBP"].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <MoneyField
              label="Original foreign invoice total"
              name="foreignGross"
              required
            />
            <Field
              label="INR translation / rate evidence"
              name="rateEvidence"
              value={source?.export?.rateEvidence}
              maxLength={300}
            />
            <Field
              label="LUT / bond reference"
              name="lut"
              value={source?.export?.lut ?? profile.lut}
              maxLength={100}
            />
            <div className="form-row">
              <Field
                label="Shipping bill number"
                name="shippingBill"
                maxLength={100}
              />
              <Field label="Shipping date" name="shippingDate" type="date" />
            </div>
            <div className="form-row">
              <Field label="Port code" name="port" maxLength={30} />
              <Field
                label="Proceeds realisation due (verified date)"
                name="realisationDue"
                type="date"
                required
              />
            </div>
            <p className="finance-help">
              Missing shipping/LUT evidence is flagged in Exports. Due dates
              must come from your adviser/bank; the app does not set a statutory
              deadline.
            </p>
          </>
        )}
        <label>
          Source notes / reference
          <textarea name="notes" maxLength={2000} rows={3} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button dark wide" disabled={busy}>
          {busy ? "Recording…" : "Record source document"}
        </button>
      </form>
    </Panel>
  );
}
function SettlementForm({
  document: d,
  save,
  close,
}: {
  document: FinanceDocument;
  save: (d: unknown) => Promise<void>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const id = useRef(crypto.randomUUID());
  const refund = d.outstandingMinor < 0;
  return (
    <Panel title={refund ? "Record refund" : "Record settlement"} close={close}>
      <p className="finance-source-ref">
        {d.number} · {d.party}
      </p>
      <p>
        Open {refund ? "refund" : "balance"}:{" "}
        <strong>{fm(Math.abs(d.outstandingMinor))}</strong>
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await save({
              id: id.current,
              documentId: d.id,
              date: field(f, "date"),
              amountMinor: amt(f, "amount"),
              bankMinor: amt(f, "bank"),
              refund,
              method: field(f, "method"),
              reference: field(f, "reference"),
              notes: field(f, "notes"),
            });
            close();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="Settlement date"
          name="date"
          type="date"
          value={now()}
          required
        />
        <MoneyField
          label="Invoice balance allocated · INR"
          name="amount"
          value={decimal(Math.abs(d.outstandingMinor))}
          required
        />
        <MoneyField
          label="Actual cash / bank amount · INR"
          name="bank"
          value={decimal(Math.abs(d.outstandingMinor))}
          required
        />
        <p className="finance-help">
          A difference is shown separately for accountant review. Do not count
          the same bank fees twice.
        </p>
        <label>
          Payment method
          <select name="method">
            {["bank", "cash", "upi", "card", "other"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <Field
          label="Bank / cash reference"
          name="reference"
          required
          maxLength={160}
        />
        <label>
          Notes
          <textarea name="notes" maxLength={500} />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="button dark" disabled={busy}>
          {busy ? "Recording…" : "Record settlement"}
        </button>
      </form>
    </Panel>
  );
}
function TaskForm({
  task,
  save,
  close,
}: {
  task?: TaxObligation;
  save: (d: unknown, task?: TaxObligation) => Promise<void>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const id = useRef(task?.id ?? crypto.randomUUID());
  return (
    <Panel title={task ? "Update tax task" : "Add tax task"} close={close}>
      <p className="finance-help">
        Enter obligations and verified deadlines supplied by your accountant.
        Completing a task does not file a return or move money.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            const d = obligationInput.parse({
              id: id.current,
              title: field(f, "title"),
              type: field(f, "type"),
              period: field(f, "period"),
              dueDate: field(f, "dueDate"),
              amountMinor: field(f, "amount") ? amt(f, "amount") : null,
              status: field(f, "status"),
              reference: field(f, "reference"),
              notes: field(f, "notes"),
            });
            await save(task ? { ...d, revision: task.revision } : d, task);
            close();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="Task"
          name="title"
          value={task?.title}
          required
          maxLength={160}
        />
        <div className="form-row">
          <label>
            Type
            <select name="type" defaultValue={task?.type ?? "GST"}>
              {["GST", "Income tax", "TDS", "Export", "Other"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <Field
            label="Tax / accounting period"
            name="period"
            value={task?.period}
            required
            maxLength={60}
          />
        </div>
        <Field
          label="Verified due date"
          name="dueDate"
          type="date"
          value={task?.dueDate}
          required
        />
        <MoneyField
          label="Amount, if confirmed · INR"
          name="amount"
          value={task?.amountMinor == null ? "" : decimal(task.amountMinor)}
        />
        <label>
          Status
          <select name="status" defaultValue={task?.status ?? "open"}>
            {["open", "filed", "paid", "complete"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <Field
          label="Filing ARN / payment reference"
          name="reference"
          value={task?.reference}
          maxLength={160}
        />
        <label>
          Notes
          <textarea name="notes" defaultValue={task?.notes} maxLength={1000} />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="button dark" disabled={busy}>
          {busy ? "Saving…" : "Save tax task"}
        </button>
      </form>
    </Panel>
  );
}
function ExportEvidenceForm({
  document: d,
  save,
  close,
}: {
  document: FinanceDocument;
  save: (path: string, body: unknown) => Promise<void>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const x = d.export!;
  return (
    <Panel title="Update export evidence" close={close}>
      <p className="finance-source-ref">
        {d.number} · {d.party}
      </p>
      <p className="finance-help">
        Add shipping, LUT and bank translation evidence. Monetary values and the
        original destination/currency remain unchanged. Evidence can be attached
        after period closure.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await save(`/documents/${d.id}/export-evidence`, {
              lut: field(f, "lut"),
              shippingBill: field(f, "shippingBill"),
              shippingDate: field(f, "shippingDate") || null,
              port: field(f, "port"),
              rateEvidence: field(f, "rateEvidence"),
              realisationDue: field(f, "realisationDue"),
              reason: field(f, "reason"),
            });
            close();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="LUT / bond reference"
          name="lut"
          value={x.lut}
          maxLength={100}
        />
        <Field
          label="Shipping bill number"
          name="shippingBill"
          value={x.shippingBill}
          maxLength={100}
        />
        <div className="form-row">
          <Field
            label="Shipping date"
            name="shippingDate"
            type="date"
            value={x.shippingDate ?? ""}
          />
          <Field label="Port code" name="port" value={x.port} maxLength={30} />
        </div>
        <Field
          label="INR translation / rate evidence"
          name="rateEvidence"
          value={x.rateEvidence}
          maxLength={300}
        />
        <Field
          label="Proceeds realisation due (verified date)"
          name="realisationDue"
          type="date"
          value={x.realisationDue}
          required
        />
        <label>
          Evidence / reason
          <textarea name="reason" required minLength={3} maxLength={500} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button dark" disabled={busy}>
          {busy ? "Saving…" : "Save export evidence"}
        </button>
      </form>
    </Panel>
  );
}
function ActionForm({
  type,
  document: d,
  profile,
  save,
  close,
}: {
  type: "cost" | "review" | "void" | "close";
  document?: FinanceDocument;
  profile: FinanceProfile;
  save: (path: string, d: unknown) => Promise<void>;
  close: () => void;
}) {
  const title = {
    cost: "Complete source cost",
    review: "Review input tax",
    void: "Void source document",
    close: "Close accounting period",
  }[type];
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Panel title={title} close={close}>
      {d && (
        <p className="finance-source-ref">
          {d.number} · {d.party}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            const reason = field(f, "reason");
            await save(
              type === "close" ? "/close" : `/documents/${d!.id}/${type}`,
              type === "cost"
                ? { costMinor: amt(f, "cost"), reason }
                : type === "review"
                  ? { status: field(f, "status"), reason }
                  : type === "close"
                    ? {
                        through: field(f, "through"),
                        revision: profile.revision,
                        reason,
                      }
                    : { reason },
            );
            close();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {type === "cost" && (
          <>
            <p className="finance-help">
              Enter verified cost, including your agreed landed-cost allocation.
              Recorded costs cannot be overwritten.
            </p>
            <MoneyField
              label="Verified cost of goods · INR"
              name="cost"
              required
            />
          </>
        )}
        {type === "review" && (
          <>
            <p className="finance-help">
              Review the supplier document, GSTR-2B and eligibility before
              selecting a status. This does not submit or claim credit on the
              GST portal.
            </p>
            <label>
              Input-tax decision
              <select name="status" defaultValue={d?.itcStatus}>
                <option value="pending">Pending review</option>
                <option value="eligible">Reviewed eligible</option>
                <option value="ineligible">Ineligible / blocked</option>
              </select>
            </label>
          </>
        )}
        {type === "void" && (
          <p className="finance-help">
            Voids remain in the audit trail. A settled source or one with active
            credits cannot be voided; record source corrections instead.
          </p>
        )}
        {type === "close" && (
          <>
            <p className="finance-help">
              Closing prevents backdated source changes, payments and tax
              reviews through this date. Resolve missing COGS and input-tax
              reviews first. This lock cannot be moved backwards in this
              workspace.
            </p>
            <Field label="Close through" name="through" type="date" required />
            <label className="checkbox-label">
              <input type="checkbox" required />I have reviewed the records and
              intend to lock this period.
            </label>
          </>
        )}
        <label>
          Evidence / reason
          <textarea name="reason" required minLength={3} maxLength={500} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className="button dark">
          {busy ? "Saving…" : title}
        </button>
      </form>
    </Panel>
  );
}
export function FinanceWorkspace() {
  const [from, setFrom] = useState(now().slice(0, 7) + "-01"),
    [to, setTo] = useState(now());
  const [tab, setTab] = useState("summary");
  const [data, setData] = useState<Workspace | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [kind, setKind] = useState("all"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const [source, setSource] = useState<FinanceDocument | "new" | null>(null),
    [settling, setSettling] = useState<FinanceDocument | null>(null),
    [task, setTask] = useState<TaxObligation | "new" | null>(null);
  const [evidence, setEvidence] = useState<FinanceDocument | null>(null);
  const [action, setAction] = useState<{
      type: "cost" | "review" | "void" | "close";
      document?: FinanceDocument;
    } | null>(null),
    [preview, setPreview] = useState<FinanceInput[] | null>(null),
    [importBusy, setImportBusy] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const d = await api<Workspace>(
        `/admin/finance/workspace?from=${from}&to=${to}`,
      );
      if (seq === sequence.current) setData(d);
    } catch (e) {
      if (seq === sequence.current) {
        setError(errorMessage(e));
        setData(null);
      }
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    void load();
    const activeSequence = sequence.current;
    return () => {
      if (sequence.current === activeSequence)
        sequence.current = activeSequence + 1;
    };
  }, [load]);
  async function post(path: string, body: unknown, method = "POST") {
    await api(`/admin/finance${path}`, body, method);
    setNotice("Financial record saved. Audit history updated.");
    await load();
  }
  const exportHref = `/api/admin/finance/documents.csv?from=${from}&to=${to}&kind=${kind}&q=${encodeURIComponent(query)}`;
  const visible =
    data?.documents.filter(
      (d) =>
        (kind === "all" || d.kind === kind) &&
        `${d.number} ${d.party} ${d.category}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) ?? [];
  const s = data?.summary;
  function changeTab(id: string) {
    setTab(id);
    setPage(0);
    setNotice("");
  }
  const section = (title: string, children: ReactNode, action?: ReactNode) => (
    <section className="work-section finance-section">
      <div className="work-section-title">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
  return (
    <div className="finance-workspace">
      <div className="finance-controls">
        <div className="finance-date-range">
          <label>
            From
            <input
              aria-label="Finance from date"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Through
            <input
              aria-label="Finance through date"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            className="icon-button"
            aria-label="Refresh finance"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        <div className="heading-actions">
          <a className="button" href={exportHref}>
            <Download size={15} />
            Export register
          </a>
          <button
            className="button dark"
            disabled={!data || loading}
            onClick={() => setSource("new")}
          >
            <Plus size={16} />
            Record document
          </button>
        </div>
      </div>
      <nav className="finance-tabs" aria-label="Finance modules">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => changeTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={tab === id ? "selected" : ""}
          >
            {label}
          </button>
        ))}
      </nav>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          {error} <button onClick={() => void load()}>Retry finance</button>
        </div>
      )}
      {loading ? (
        <section className="work-section empty" role="status">
          <h2>Loading financial records…</h2>
          <p>Amounts will appear after source records are loaded.</p>
        </section>
      ) : !data || !s ? (
        <section className="work-section empty">
          <h2>Finance is unavailable.</h2>
          <p>Refresh finance to try again.</p>
        </section>
      ) : (
        <>
          {data.profile.registration === "unconfirmed" && (
            <div className="finance-callout">
              <strong>
                Confirm the finance setup before using GST or export records.
              </strong>
              <button className="text-link" onClick={() => changeTab("setup")}>
                Open setup <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          {tab === "summary" && (
            <>
              <div className="finance-metrics">
                {[
                  [
                    "Net revenue",
                    fm(s.revenue),
                    "Source sales less credits; excludes GST",
                  ],
                  [
                    "Gross profit",
                    fm(s.grossProfit),
                    s.missingCosts
                      ? `${s.missingCosts} sales/credit records need verified cost`
                      : "Revenue less recorded cost of goods",
                  ],
                  [
                    "Operating expenses",
                    fm(s.expense),
                    "Unreviewed input tax included conservatively",
                  ],
                  [
                    "Operating result",
                    fm(s.operatingResult),
                    "Before income tax and settlement differences",
                  ],
                ].map(([label, value, hint]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{hint}</small>
                  </div>
                ))}
              </div>
              {s.missingCosts > 0 && (
                <div className="finance-callout">
                  <strong>
                    Profit is unavailable until all source sales costs are
                    known.
                  </strong>
                  <button
                    className="text-link"
                    onClick={() => changeTab("documents")}
                  >
                    Review source costs
                  </button>
                </div>
              )}
              <div className="finance-columns">
                {section(
                  "Recorded cash movement",
                  <dl className="finance-rows">
                    <div>
                      <dt>Collections / cash received</dt>
                      <dd>{fm(s.cashIn)}</dd>
                    </div>
                    <div>
                      <dt>Supplier payments / refunds paid</dt>
                      <dd>{fm(s.cashOut)}</dd>
                    </div>
                    <div>
                      <dt>Net recorded movement</dt>
                      <dd>{fm(s.netCash)}</dd>
                    </div>
                    <div>
                      <dt>Settlement differences for review</dt>
                      <dd>{fm(s.settlementVariance)}</dd>
                    </div>
                  </dl>,
                )}
                {section(
                  "Source coverage",
                  <dl className="finance-rows">
                    <div>
                      <dt>Posted documents in period</dt>
                      <dd>{s.documentCount}</dd>
                    </div>
                    <div>
                      <dt>Export revenue in INR</dt>
                      <dd>{fm(s.exportRevenue)}</dd>
                    </div>
                    <div>
                      <dt>Open documents as of {to}</dt>
                      <dd>{data.balances.length}</dd>
                    </div>
                    <div>
                      <dt>Period locked through</dt>
                      <dd>
                        {data.profile.closedThrough || "No period locked"}
                      </dd>
                    </div>
                  </dl>,
                )}
              </div>
              <p className="finance-footnote">
                Management subledger for recorded source documents. Cash
                movement is not a bank balance. Missing records, tax review and
                cost allocation affect the result. Input-credit figures require
                reconciliation; no tax return is filed here.
              </p>
            </>
          )}
          {tab === "documents" &&
            section(
              "Source registers",
              <>
                <div className="finance-register-tools">
                  <label>
                    Record type
                    <select
                      value={kind}
                      onChange={(e) => {
                        setKind(e.target.value);
                        setPage(0);
                      }}
                    >
                      <option value="all">All records</option>
                      {financeKinds.map((k) => (
                        <option key={k} value={k}>
                          {kindLabel[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Find a source
                    <input
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(0);
                      }}
                      placeholder="Reference, party or category"
                    />
                  </label>
                  <button
                    className="button"
                    onClick={() =>
                      saveCsv(
                        financeCsvHeaders.join(",") + "\r\n",
                        "Lenore-finance-template.csv",
                      )
                    }
                  >
                    <Download size={14} />
                    CSV template
                  </button>
                  <label className="button finance-file">
                    <FileUp size={14} />
                    Preview CSV
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        try {
                          if (f.size > 2_000_000)
                            throw new Error("Use a CSV smaller than 2 MB.");
                          setPreview(parseFinanceCsv(await f.text()));
                        } catch (e) {
                          setError(errorMessage(e));
                        }
                      }}
                    />
                  </label>
                </div>
                <div
                  className="data-table-wrap"
                  tabIndex={0}
                  role="region"
                  aria-label="Scrollable table"
                >
                  <table className="data-table finance-table">
                    <thead>
                      <tr>
                        <th>Source document</th>
                        <th>Party</th>
                        <th className="right">Net / GST</th>
                        <th className="right">Total</th>
                        <th>Review</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.slice(page * 30, page * 30 + 30).map((d) => (
                        <tr
                          key={d.id}
                          className={d.status === "void" ? "finance-void" : ""}
                        >
                          <td>
                            <strong>{d.number}</strong>
                            <small>
                              {kindLabel[d.kind]} · {d.date}
                            </small>
                            <small>
                              {d.status === "void"
                                ? `VOID · ${d.voidReason}`
                                : d.category}
                            </small>
                          </td>
                          <td>
                            {d.party}
                            <small>{d.gstin || "No GSTIN recorded"}</small>
                          </td>
                          <td className="right">
                            {fm(d.netMinor)}
                            <small>GST {fm(tax(d))}</small>
                          </td>
                          <td className="right">{fm(d.grossMinor)}</td>
                          <td>
                            {["sale", "sale_credit"].includes(d.kind) ? (
                              <span
                                className={`badge ${d.costMinor === null ? "low" : "live"}`}
                              >
                                {d.costMinor === null
                                  ? "Cost missing"
                                  : "Cost recorded"}
                              </span>
                            ) : (
                              <span
                                className={`badge ${d.itcStatus === "pending" ? "low" : "draft"}`}
                              >
                                ITC {d.itcStatus}
                              </span>
                            )}
                          </td>
                          <td>
                            {d.status === "posted" && (
                              <details className="finance-actions">
                                <summary>Actions</summary>
                                <div>
                                  {["sale", "purchase", "expense"].includes(
                                    d.kind,
                                  ) &&
                                    d.outstandingMinor !== 0 && (
                                      <button onClick={() => setSettling(d)}>
                                        Record settlement
                                      </button>
                                    )}
                                  {["sale", "purchase", "expense"].includes(
                                    d.kind,
                                  ) && (
                                    <button onClick={() => setSource(d)}>
                                      Create credit note
                                    </button>
                                  )}
                                  {["sale", "sale_credit"].includes(d.kind) &&
                                    d.costMinor === null && (
                                      <button
                                        onClick={() =>
                                          setAction({
                                            type: "cost",
                                            document: d,
                                          })
                                        }
                                      >
                                        Complete cost
                                      </button>
                                    )}
                                  {[
                                    "purchase",
                                    "expense",
                                    "purchase_credit",
                                  ].includes(d.kind) && (
                                    <button
                                      onClick={() =>
                                        setAction({
                                          type: "review",
                                          document: d,
                                        })
                                      }
                                    >
                                      Review input tax
                                    </button>
                                  )}
                                  {d.export && (
                                    <button onClick={() => setEvidence(d)}>
                                      Update export evidence
                                    </button>
                                  )}
                                  <button
                                    onClick={() =>
                                      setAction({ type: "void", document: d })
                                    }
                                  >
                                    Void with reason
                                  </button>
                                  <small>Source ID: {d.id}</small>
                                  <small>{d.notes}</small>
                                </div>
                              </details>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!visible.length && (
                    <p className="finance-empty">
                      No source documents match this period and filter.
                    </p>
                  )}
                </div>
                <div className="table-foot">
                  <span>
                    {visible.length} source records · Posted values are
                    immutable
                  </span>
                  <div>
                    <button
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </button>
                    <span> Page {page + 1} </span>
                    <button
                      disabled={(page + 1) * 30 >= visible.length}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>,
            )}
          {tab === "balances" && (
            <>
              {section(
                `Open balances · as of ${to}`,
                <div
                  className="data-table-wrap"
                  tabIndex={0}
                  role="region"
                  aria-label="Scrollable table"
                >
                  <table className="data-table finance-table">
                    <thead>
                      <tr>
                        <th>Party / source</th>
                        <th>Type</th>
                        <th>Due / age</th>
                        <th className="right">Outstanding</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.balances.map((d) => {
                        const days = Math.floor(
                          (Date.parse(to) - Date.parse(d.dueDate)) / 86400000,
                        );
                        return (
                          <tr key={d.id}>
                            <td>
                              <strong>{d.party}</strong>
                              <small>{d.number}</small>
                            </td>
                            <td>
                              {d.outstandingMinor < 0
                                ? "Refund due"
                                : d.kind === "sale"
                                  ? "Receivable"
                                  : "Payable"}
                            </td>
                            <td>
                              {d.dueDate}
                              <small>
                                {days > 0
                                  ? `${days} days past due`
                                  : "Not past due"}
                              </small>
                            </td>
                            <td className="right">
                              {fm(Math.abs(d.outstandingMinor))}
                            </td>
                            <td>
                              <button
                                className="row-action"
                                onClick={() => setSettling(d)}
                              >
                                Record{" "}
                                {d.outstandingMinor < 0
                                  ? "refund"
                                  : "settlement"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!data.balances.length && (
                    <p className="finance-empty">
                      No open source balances as of this date.
                    </p>
                  )}
                </div>,
              )}
              {section(
                "Settlements in period",
                <div
                  className="data-table-wrap"
                  tabIndex={0}
                  role="region"
                  aria-label="Scrollable table"
                >
                  <table className="data-table finance-table">
                    <thead>
                      <tr>
                        <th>Date / reference</th>
                        <th>Source</th>
                        <th>Method</th>
                        <th className="right">Allocated INR</th>
                        <th className="right">Actual INR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.settlements.map((p) => (
                        <tr key={p.id}>
                          <td>
                            {p.date}
                            <small>{p.reference}</small>
                          </td>
                          <td>
                            {p.documentNumber}
                            <small>
                              {p.party} · {p.refund ? "Refund" : "Settlement"}
                            </small>
                          </td>
                          <td>{p.method}</td>
                          <td className="right">{fm(p.amountMinor)}</td>
                          <td className="right">{fm(p.bankMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data.settlements.length && (
                    <p className="finance-empty">
                      No receipts or payments recorded in this period.
                    </p>
                  )}
                </div>,
              )}
            </>
          )}
          {tab === "tax" && (
            <>
              {section(
                "GST component workbook",
                <>
                  <p className="finance-help finance-inset">
                    Source-based amounts for accountant reconciliation. Reviewed
                    input credit is shown separately; this table is not a
                    tax-payable calculation or a filed GSTR return.
                  </p>
                  <div
                    className="data-table-wrap"
                    tabIndex={0}
                    role="region"
                    aria-label="Scrollable table"
                  >
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>INR · source tax</th>
                          <th className="right">CGST</th>
                          <th className="right">SGST</th>
                          <th className="right">IGST</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Output tax, net of sales credits", s.output],
                          ["Input tax · reviewed eligible", s.eligible],
                          ["Input tax · pending review", s.pending],
                          ["Input tax · ineligible / blocked", s.ineligible],
                        ].map(([label, bucket]) => (
                          <tr key={String(label)}>
                            <td>{String(label)}</td>
                            {(
                              ["cgstMinor", "sgstMinor", "igstMinor"] as const
                            ).map((k) => (
                              <td key={k} className="right">
                                {fm((bucket as typeof s.output)[k])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>,
              )}
              {section(
                "Input documents awaiting review",
                <div className="finance-review-list">
                  {data.documents
                    .filter(
                      (d) =>
                        d.status === "posted" &&
                        ["purchase", "expense", "purchase_credit"].includes(
                          d.kind,
                        ) &&
                        d.itcStatus === "pending" &&
                        tax(d) > 0,
                    )
                    .map((d) => (
                      <div key={d.id}>
                        <div>
                          <strong>
                            {d.number} · {d.party}
                          </strong>
                          <small>
                            {fm(tax(d))} source tax ·{" "}
                            {d.gstin || "GSTIN missing"}
                          </small>
                        </div>
                        <button
                          className="button"
                          onClick={() =>
                            setAction({ type: "review", document: d })
                          }
                        >
                          Review
                        </button>
                      </div>
                    ))}
                  {!data.documents.some(
                    (d) =>
                      d.status === "posted" &&
                      ["purchase", "expense", "purchase_credit"].includes(
                        d.kind,
                      ) &&
                      d.itcStatus === "pending" &&
                      tax(d) > 0,
                  ) && (
                    <p className="finance-empty">
                      No taxable input documents await review in this period.
                    </p>
                  )}
                </div>,
              )}
              <p className="finance-footnote">
                Review GSTR-1, GSTR-2B and GSTR-3B with your accountant. Reverse
                charge, cess, TDS/TCS, refund entitlement and income tax need
                their source records and professional classification; no
                automatic liability is inferred.
              </p>
            </>
          )}
          {tab === "exports" &&
            section(
              "Export documents and proceeds",
              <>
                <p className="finance-help finance-inset">
                  Indian export source records, translated into INR from the
                  source invoice. Destination does not imply overseas VAT
                  registration. Realisation dates and rate evidence must be
                  verified.
                </p>
                <div
                  className="data-table-wrap"
                  tabIndex={0}
                  role="region"
                  aria-label="Scrollable table"
                >
                  <table className="data-table finance-table">
                    <thead>
                      <tr>
                        <th>Invoice / destination</th>
                        <th>Original amount</th>
                        <th>INR value</th>
                        <th>Treatment / evidence</th>
                        <th>Proceeds due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.documents
                        .filter((d) => d.export && d.status === "posted")
                        .map((d) => {
                          const x = d.export!;
                          const missing = [
                            !data.profile.iec && "IEC",
                            !x.shippingBill && "shipping bill",
                            !x.port && "port",
                            !x.rateEvidence && "rate evidence",
                            d.supply === "export_lut" && !x.lut && "LUT",
                          ].filter(Boolean);
                          return (
                            <tr key={d.id}>
                              <td>
                                <strong>{d.number}</strong>
                                <small>
                                  {d.party} · {x.country}
                                </small>
                                <small>{kindLabel[d.kind]}</small>
                              </td>
                              <td>
                                {x.currency} {decimal(x.foreignGrossMinor)}
                              </td>
                              <td>{fm(d.grossMinor)}</td>
                              <td>
                                {d.supply === "export_lut"
                                  ? "LUT / bond"
                                  : "Export IGST"}
                                <small>
                                  {missing.length
                                    ? `Missing: ${missing.join(", ")}`
                                    : `Shipping bill ${x.shippingBill} · ${x.port}`}
                                </small>
                                <small>{x.rateEvidence}</small>
                              </td>
                              <td>
                                {x.realisationDue}
                                <small>
                                  {d.outstandingMinor > 0 &&
                                  x.realisationDue < to
                                    ? "Proceeds need follow-up"
                                    : d.outstandingMinor === 0
                                      ? "Allocated as settled"
                                      : "Track bank evidence"}
                                </small>
                                <button
                                  className="row-action"
                                  onClick={() => setEvidence(d)}
                                >
                                  Update evidence
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {!data.documents.some(
                    (d) => d.export && d.status === "posted",
                  ) && (
                    <p className="finance-empty">
                      No export source documents in this period.
                    </p>
                  )}
                </div>
              </>,
            )}
          {tab === "tasks" &&
            section(
              "Tax and compliance tasks",
              <div className="finance-review-list">
                {data.obligations.map((t) => (
                  <div key={t.id}>
                    <div>
                      <strong>{t.title}</strong>
                      <small>
                        {t.type} · {t.period} · Due {t.dueDate} · {t.status}
                        {t.status === "open" && t.dueDate < now()
                          ? " · Past due"
                          : ""}
                      </small>
                      <small>
                        {t.reference || "No completion reference"}
                        {t.amountMinor !== null
                          ? ` · ${fm(t.amountMinor)}`
                          : ""}
                      </small>
                    </div>
                    <button className="button" onClick={() => setTask(t)}>
                      Update task
                    </button>
                  </div>
                ))}
                {!data.obligations.length && (
                  <p className="finance-empty">
                    Add verified GST, income-tax, TDS or export obligations. No
                    deadlines are fabricated.
                  </p>
                )}
              </div>,
              <button className="button" onClick={() => setTask("new")}>
                <Plus size={14} />
                Add tax task
              </button>,
            )}
          {tab === "audit" &&
            section(
              "Financial audit · latest 100 events",
              <div className="finance-audit">
                {data.audit.map((a) => (
                  <article key={a.id}>
                    <div>
                      <strong>{a.action.replaceAll("_", " ")}</strong>
                      <time>
                        {new Date(a.created_at).toLocaleString("en-IN")}
                      </time>
                    </div>
                    <details>
                      <summary>Source evidence</summary>
                      <pre>{a.detail}</pre>
                      <small>{a.entity_id}</small>
                    </details>
                  </article>
                ))}
                {!data.audit.length && (
                  <p className="finance-empty">
                    No financial records have been created.
                  </p>
                )}
              </div>,
            )}
          {tab === "setup" && (
            <div className="finance-columns">
              {section(
                "Indian business setup",
                <SetupForm
                  profile={data.profile}
                  save={async (body) => {
                    await post("/profile", body, "PUT");
                  }}
                />,
              )}
              {section(
                "Period controls",
                <div className="finance-inset">
                  <p>
                    Locked through:{" "}
                    <strong>
                      {data.profile.closedThrough || "No period closed"}
                    </strong>
                  </p>
                  <p className="finance-help">
                    Close only reconciled periods. Missing cost and pending
                    input-tax reviews block closure. Source data, settlements
                    and audit events are retained.
                  </p>
                  <button
                    className="button"
                    onClick={() => setAction({ type: "close" })}
                  >
                    Close reviewed period
                  </button>
                  <hr />
                  <p className="finance-help">
                    Billing connection: <strong>Not connected</strong>. Import
                    already-issued source documents using Registers → CSV
                    template / Preview CSV. This workspace does not issue
                    invoices or post physical stock.
                  </p>
                </div>,
              )}
            </div>
          )}
          {evidence && (
            <ExportEvidenceForm
              document={evidence}
              save={post}
              close={() => setEvidence(null)}
            />
          )}
          {source && (
            <SourceForm
              profile={data.profile}
              source={source === "new" ? undefined : source}
              save={(d) => post("/documents", d)}
              close={() => setSource(null)}
            />
          )}
          {settling && (
            <SettlementForm
              document={settling}
              save={(d) => post("/settlements", d)}
              close={() => setSettling(null)}
            />
          )}
          {task && (
            <TaskForm
              task={task === "new" ? undefined : task}
              save={(d, t) =>
                post(
                  t ? `/obligations/${t.id}` : "/obligations",
                  d,
                  t ? "PUT" : "POST",
                )
              }
              close={() => setTask(null)}
            />
          )}
          {action && (
            <ActionForm
              {...action}
              profile={data.profile}
              save={post}
              close={() => setAction(null)}
            />
          )}
          {preview && (
            <Panel
              title="Review finance import"
              close={() => !importBusy && setPreview(null)}
            >
              <p>
                {preview.length} source documents validated. Import records
                financial values only and preserves existing matching
                references.
              </p>
              <div className="finance-import-preview">
                {preview.map((d) => (
                  <div key={d.id}>
                    <strong>
                      {d.number} · {kindLabel[d.kind]}
                    </strong>
                    <small>
                      {d.party} · {d.date} ·{" "}
                      {fm(
                        d.netMinor + tax(d) + d.freightMinor + d.roundingMinor,
                      )}
                    </small>
                  </div>
                ))}
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button dark wide"
                disabled={importBusy}
                onClick={async () => {
                  setImportBusy(true);
                  setError("");
                  try {
                    const r = await api<{ imported: number; skipped: number }>(
                      "/admin/finance/import",
                      { documents: preview },
                      "POST",
                    );
                    setNotice(
                      `Imported ${r.imported} documents; ${r.skipped} identical references skipped.`,
                    );
                    setPreview(null);
                    await load();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setImportBusy(false);
                  }
                }}
              >
                {importBusy ? "Importing…" : "Import reviewed documents"}
              </button>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
function SetupForm({
  profile,
  save,
}: {
  profile: FinanceProfile;
  save: (d: unknown) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="finance-setup-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          await save({
            ...profileInput.parse({
              name: field(f, "name"),
              gstin: field(f, "gstin"),
              stateCode: field(f, "stateCode"),
              iec: field(f, "iec"),
              lut: field(f, "lut"),
              registration: field(f, "registration"),
            }),
            revision: profile.revision,
          });
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field
        label="Legal / trading name"
        name="name"
        value={profile.name}
        required
        maxLength={160}
      />
      <label>
        GST registration status
        <select name="registration" defaultValue={profile.registration}>
          <option value="unconfirmed">Not yet confirmed</option>
          <option value="regular">Regular GST registration</option>
          <option value="composition">Composition registration</option>
          <option value="unregistered">Unregistered</option>
        </select>
      </label>
      <div className="form-row">
        <Field
          label="Company GSTIN"
          name="gstin"
          value={profile.gstin}
          maxLength={15}
        />
        <Field
          label="GST state code"
          name="stateCode"
          value={profile.stateCode}
          maxLength={2}
        />
      </div>
      <Field
        label="IEC reference"
        name="iec"
        value={profile.iec}
        maxLength={20}
      />
      <Field
        label="Current LUT / bond reference"
        name="lut"
        value={profile.lut}
        maxLength={100}
      />
      <p className="finance-help">
        Base: INR · Financial year: April–March. Confirm legal details from
        actual records; this form does not verify registration with the
        government.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button dark" disabled={busy}>
        {busy ? "Saving…" : "Save finance setup"}
      </button>
    </form>
  );
}
