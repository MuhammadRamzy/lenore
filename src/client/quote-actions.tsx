import { useState } from "react";
import { Copy, Download, Printer, Send } from "lucide-react";
import { money } from "../shared";
import {
  downloadQuotation,
  quotationText,
  quotationTotal,
  type Quotation,
} from "./quotation";
import { errorMessage } from "./api";

export function QuoteActions({
  quotation,
  whatsapp,
}: {
  quotation: Quotation;
  whatsapp: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(""),
    [recipient, setRecipient] = useState("");
  let text = "",
    total: number | null = null;
  try {
    text = quotationText(quotation);
    total = quotationTotal(quotation.items);
  } catch (e) {
    text = errorMessage(e);
  }
  const valid = text.startsWith("LENORE");
  const client = quotation.customer.phone.replace(/\D/g, "");
  const link = (phone: string) =>
    `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  return (
    <>
      <div className="quotation-summary">
        <div className="customer-print">
          <strong>{quotation.customer.name || "Customer not specified"}</strong>
          <span>{quotation.customer.phone}</span>
          <span>{quotation.customer.notes}</span>
        </div>
        <div>
          <span>
            {quotation.items.length} products ·{" "}
            {quotation.items.reduce((n, i) => n + i.quantity, 0)} total quantity
          </span>
          <small>{quotation.reference}</small>
        </div>
        <div>
          <span>Suggested MRP total</span>
          <strong>{valid ? money(total) : "Split this quotation"}</strong>
        </div>
        <p>Suggested MRP, subject to confirmation.</p>
      </div>
      <div className="share-actions">
        <button
          className="button"
          disabled={busy || !valid}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await downloadQuotation(quotation);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={16} />
          {busy ? "Preparing PDF…" : "Download PDF"}
        </button>
        <button className="button" onClick={() => window.print()}>
          <Printer size={16} /> Print enquiry
        </button>
        <button
          className="button"
          disabled={!valid}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(text);
              setError("");
            } catch {
              setError(
                "Text could not be copied. Use PDF or WhatsApp instead.",
              );
            }
          }}
        >
          <Copy size={16} />
          {copied === text ? "Text copied" : "Copy text"}
        </button>
        <a className="button" target="_blank" rel="noreferrer" href={link("")}>
          <Send size={16} /> Share on WhatsApp
        </a>
        {whatsapp && (
          <a
            className="button"
            target="_blank"
            rel="noreferrer"
            href={link(whatsapp)}
          >
            Send to Lenore <Send size={16} />
          </a>
        )}
        {/^\d{7,15}$/.test(client) && (
          <a
            className="button"
            target="_blank"
            rel="noreferrer"
            href={link(client)}
          >
            Send to client <Send size={16} />
          </a>
        )}
      </div>
      <details className="custom-recipient">
        <summary>Send to another WhatsApp number</summary>
        <label>
          Recipient number
          <input
            type="tel"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Country code and number"
          />
        </label>
        {/^\d{7,15}$/.test(recipient.replace(/\D/g, "")) && (
          <a
            className="button"
            target="_blank"
            rel="noreferrer"
            href={link(recipient.replace(/\D/g, ""))}
          >
            Open WhatsApp <Send size={15} />
          </a>
        )}
      </details>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
