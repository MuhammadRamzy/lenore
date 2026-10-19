-- Independent source-document subledger. No billing or inventory triggers.
CREATE TABLE finance_profile (
  id INTEGER PRIMARY KEY CHECK(id=1),
  data TEXT NOT NULL CHECK(json_valid(data)),
  closed_through TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO finance_profile(id,data) VALUES(1,'{"name":"Lenore","gstin":"","stateCode":"","iec":"","lut":"","registration":"unconfirmed"}');

CREATE TABLE finance_documents (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  fingerprint TEXT NOT NULL,
  reference_key TEXT NOT NULL UNIQUE,
  kind TEXT GENERATED ALWAYS AS (json_extract(data,'$.kind')) STORED,
  document_date TEXT GENERATED ALWAYS AS (json_extract(data,'$.date')) STORED,
  parent_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.parentId')) STORED REFERENCES finance_documents(id),
  net_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.netMinor')) STORED,
  cgst_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.cgstMinor')) STORED,
  sgst_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.sgstMinor')) STORED,
  igst_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.igstMinor')) STORED,
  cost_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.costMinor')) STORED,
  freight_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.freightMinor')) STORED,
  rounding_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.roundingMinor')) STORED,
  gross_minor INTEGER GENERATED ALWAYS AS (net_minor+freight_minor+rounding_minor+cgst_minor+sgst_minor+igst_minor) STORED,
  status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','void')),
  void_reason TEXT NOT NULL DEFAULT '',
  change_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(kind IN ('sale','purchase','expense','sale_credit','purchase_credit')),
  CHECK(net_minor>=0 AND cgst_minor>=0 AND sgst_minor>=0 AND igst_minor>=0 AND gross_minor>0),
  CHECK(cost_minor IS NULL OR cost_minor>=0)
);
CREATE INDEX finance_documents_date ON finance_documents(document_date);
CREATE INDEX finance_documents_parent ON finance_documents(parent_id);

CREATE TABLE finance_settlements (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES finance_documents(id),
  data TEXT NOT NULL CHECK(json_valid(data)),
  fingerprint TEXT NOT NULL,
  settlement_date TEXT GENERATED ALWAYS AS (json_extract(data,'$.date')) STORED,
  amount_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.amountMinor')) STORED,
  bank_minor INTEGER GENERATED ALWAYS AS (json_extract(data,'$.bankMinor')) STORED,
  refund INTEGER GENERATED ALWAYS AS (json_extract(data,'$.refund')) STORED,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(amount_minor>0 AND bank_minor>0 AND refund IN (0,1))
);
CREATE INDEX finance_settlements_document ON finance_settlements(document_id);
CREATE INDEX finance_settlements_date ON finance_settlements(settlement_date);
CREATE VIEW finance_balances AS
SELECT d.*,
 COALESCE((SELECT SUM(s.amount_minor * CASE WHEN s.refund=1 THEN -1 ELSE 1 END) FROM finance_settlements s WHERE s.document_id=d.id),0) AS settled_minor,
 COALESCE((SELECT SUM(c.gross_minor) FROM finance_documents c WHERE c.parent_id=d.id AND c.status='posted'),0) AS credits_minor
FROM finance_documents d;

CREATE TABLE finance_obligations (
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)), revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE finance_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, entity_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TRIGGER finance_document_guard BEFORE INSERT ON finance_documents BEGIN
 SELECT CASE WHEN NEW.document_date <= (SELECT closed_through FROM finance_profile WHERE id=1) THEN RAISE(ABORT,'finance: This accounting period is closed.') END;
 SELECT CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM finance_documents p WHERE p.id=NEW.parent_id AND p.status='posted' AND ((NEW.kind='sale_credit' AND p.kind='sale') OR (NEW.kind='purchase_credit' AND p.kind='purchase')) AND NEW.document_date>=p.document_date AND json_extract(NEW.data,'$.party')=json_extract(p.data,'$.party') AND json_extract(NEW.data,'$.gstin')=json_extract(p.data,'$.gstin') AND json_extract(NEW.data,'$.supply')=json_extract(p.data,'$.supply')) THEN RAISE(ABORT,'finance: Credit must match an active source document, party and tax treatment.') END;
 SELECT CASE WHEN NEW.parent_id IS NOT NULL AND EXISTS(SELECT 1 FROM finance_documents p WHERE p.id=NEW.parent_id AND (
  NEW.net_minor+COALESCE((SELECT SUM(c.net_minor) FROM finance_documents c WHERE c.parent_id=p.id AND c.status='posted'),0)>p.net_minor OR
  NEW.cgst_minor+COALESCE((SELECT SUM(c.cgst_minor) FROM finance_documents c WHERE c.parent_id=p.id AND c.status='posted'),0)>p.cgst_minor OR
  NEW.sgst_minor+COALESCE((SELECT SUM(c.sgst_minor) FROM finance_documents c WHERE c.parent_id=p.id AND c.status='posted'),0)>p.sgst_minor OR
  NEW.igst_minor+COALESCE((SELECT SUM(c.igst_minor) FROM finance_documents c WHERE c.parent_id=p.id AND c.status='posted'),0)>p.igst_minor OR
  NEW.gross_minor+COALESCE((SELECT SUM(c.gross_minor) FROM finance_documents c WHERE c.parent_id=p.id AND c.status='posted'),0)>p.gross_minor OR
  NEW.freight_minor+COALESCE((SELECT SUM(c.freight_minor) FROM finance_documents c WHERE c.parent_id=p.id AND c.status='posted'),0)>p.freight_minor OR
  (NEW.cost_minor IS NOT NULL AND p.cost_minor IS NOT NULL AND NEW.cost_minor+COALESCE((SELECT SUM(c.cost_minor) FROM finance_documents c WHERE c.parent_id=p.id AND c.status='posted'),0)>p.cost_minor)
 )) THEN RAISE(ABORT,'finance: Cumulative credit exceeds its source amounts.') END;
END;
CREATE TRIGGER finance_document_update_guard BEFORE UPDATE ON finance_documents BEGIN
 SELECT CASE WHEN OLD.document_date <= (SELECT closed_through FROM finance_profile WHERE id=1) THEN RAISE(ABORT,'finance: This accounting period is closed.') END;
 SELECT CASE WHEN OLD.status='void' OR NEW.id<>OLD.id OR NEW.reference_key<>OLD.reference_key OR NEW.fingerprint<>OLD.fingerprint OR NEW.created_at<>OLD.created_at THEN RAISE(ABORT,'finance: Posted source records are immutable.') END;
 SELECT CASE WHEN NEW.status='void' AND (NEW.data<>OLD.data OR length(trim(NEW.void_reason))<3 OR EXISTS(SELECT 1 FROM finance_settlements WHERE document_id=OLD.id) OR EXISTS(SELECT 1 FROM finance_documents WHERE parent_id=OLD.id AND status='posted')) THEN RAISE(ABORT,'finance: Settle dependent payments/credits through corrections before voiding; a reason is required.') END;
 SELECT CASE WHEN NEW.status='posted' AND NOT(NEW.data<>OLD.data AND length(trim(NEW.change_reason))>=3 AND ((OLD.cost_minor IS NULL AND NEW.cost_minor IS NOT NULL AND NEW.kind IN ('sale','sale_credit') AND json_remove(NEW.data,'$.costMinor')=json_remove(OLD.data,'$.costMinor')) OR (NEW.kind IN ('purchase','expense','purchase_credit') AND json_remove(NEW.data,'$.itcStatus','$.reviewNote')=json_remove(OLD.data,'$.itcStatus','$.reviewNote')))) THEN RAISE(ABORT,'finance: Only missing sales cost or documented input-tax review may change.') END;
 SELECT CASE WHEN NEW.status='posted' AND NEW.kind='sale' AND NEW.cost_minor<COALESCE((SELECT SUM(cost_minor) FROM finance_documents WHERE parent_id=OLD.id AND status='posted'),0) THEN RAISE(ABORT,'finance: Cost cannot be below its existing credit costs.') END;
 SELECT CASE WHEN NEW.status='posted' AND NEW.kind='sale_credit' AND EXISTS(SELECT 1 FROM finance_documents p WHERE p.id=NEW.parent_id AND p.cost_minor IS NOT NULL AND NEW.cost_minor+COALESCE((SELECT SUM(cost_minor) FROM finance_documents c WHERE c.parent_id=p.id AND c.id<>NEW.id AND c.status='posted'),0)>p.cost_minor) THEN RAISE(ABORT,'finance: Credit cost exceeds the source cost.') END;
END;
CREATE TRIGGER finance_document_no_delete BEFORE DELETE ON finance_documents BEGIN SELECT RAISE(ABORT,'finance: Source records cannot be deleted.'); END;
CREATE TRIGGER finance_document_audit AFTER INSERT ON finance_documents BEGIN INSERT INTO finance_audit(entity_id,action,detail) VALUES(NEW.id,'document_recorded',NEW.data); END;
CREATE TRIGGER finance_document_change_audit AFTER UPDATE ON finance_documents BEGIN INSERT INTO finance_audit(entity_id,action,detail) VALUES(NEW.id,CASE WHEN NEW.status='void' THEN 'document_voided' WHEN OLD.cost_minor IS NULL AND NEW.cost_minor IS NOT NULL THEN 'cost_completed' ELSE 'input_tax_reviewed' END,CASE WHEN NEW.status='void' THEN NEW.void_reason ELSE NEW.change_reason END); END;

CREATE TRIGGER finance_settlement_guard BEFORE INSERT ON finance_settlements BEGIN
 SELECT CASE WHEN NEW.settlement_date <= (SELECT closed_through FROM finance_profile WHERE id=1) THEN RAISE(ABORT,'finance: This accounting period is closed.') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM finance_documents d WHERE d.id=NEW.document_id AND d.status='posted' AND d.kind IN ('sale','purchase','expense') AND NEW.settlement_date>=d.document_date) THEN RAISE(ABORT,'finance: Settlement needs an active source invoice/bill and a valid date.') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM finance_balances b WHERE b.id=NEW.document_id AND ((NEW.refund=0 AND NEW.amount_minor>b.gross_minor-b.credits_minor-b.settled_minor) OR (NEW.refund=1 AND NEW.amount_minor> -(b.gross_minor-b.credits_minor-b.settled_minor)))) THEN RAISE(ABORT,'finance: Amount exceeds the open balance or refund due.') END;
END;
CREATE TRIGGER finance_settlement_audit AFTER INSERT ON finance_settlements BEGIN INSERT INTO finance_audit(entity_id,action,detail) VALUES(NEW.document_id,CASE WHEN NEW.refund=1 THEN 'refund_recorded' ELSE 'payment_recorded' END,NEW.data); END;
CREATE TRIGGER finance_settlement_no_update BEFORE UPDATE ON finance_settlements BEGIN SELECT RAISE(ABORT,'finance: Settlement history is immutable.'); END;
CREATE TRIGGER finance_settlement_no_delete BEFORE DELETE ON finance_settlements BEGIN SELECT RAISE(ABORT,'finance: Settlement history cannot be deleted.'); END;
CREATE TRIGGER finance_audit_no_update BEFORE UPDATE ON finance_audit BEGIN SELECT RAISE(ABORT,'finance: Audit history is immutable.'); END;
CREATE TRIGGER finance_audit_no_delete BEFORE DELETE ON finance_audit BEGIN SELECT RAISE(ABORT,'finance: Audit history cannot be deleted.'); END;
CREATE TRIGGER finance_profile_guard BEFORE UPDATE ON finance_profile BEGIN
 SELECT CASE WHEN NEW.closed_through<OLD.closed_through OR NEW.revision<>OLD.revision+1 THEN RAISE(ABORT,'finance: Period locks only advance; refresh the finance setup.') END;
END;
CREATE TRIGGER finance_profile_audit AFTER UPDATE ON finance_profile BEGIN INSERT INTO finance_audit(entity_id,action,detail) VALUES('profile','setup_or_period_updated',json_object('data',json(NEW.data),'closedThrough',NEW.closed_through)); END;
CREATE TRIGGER finance_obligation_insert_audit AFTER INSERT ON finance_obligations BEGIN INSERT INTO finance_audit(entity_id,action,detail) VALUES(NEW.id,'obligation_added',NEW.data); END;
CREATE TRIGGER finance_obligation_update_audit AFTER UPDATE ON finance_obligations BEGIN INSERT INTO finance_audit(entity_id,action,detail) VALUES(NEW.id,'obligation_updated',NEW.data); END;
