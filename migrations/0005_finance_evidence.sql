-- Supplier credits may correct expense bills; non-monetary export evidence remains amendable.
DROP VIEW finance_balances;
CREATE VIEW finance_balances AS
SELECT d.*,
 (SELECT p.kind FROM finance_documents p WHERE p.id=d.parent_id) AS parent_kind,
 COALESCE((SELECT SUM(s.amount_minor * CASE WHEN s.refund=1 THEN -1 ELSE 1 END) FROM finance_settlements s WHERE s.document_id=d.id),0) AS settled_minor,
 COALESCE((SELECT SUM(c.gross_minor) FROM finance_documents c WHERE c.parent_id=d.id AND c.status='posted'),0) AS credits_minor
FROM finance_documents d;
DROP TRIGGER finance_document_guard;
DROP TRIGGER finance_document_update_guard;
CREATE TRIGGER finance_document_guard BEFORE INSERT ON finance_documents BEGIN
 SELECT CASE WHEN NEW.document_date <= (SELECT closed_through FROM finance_profile WHERE id=1) THEN RAISE(ABORT,'finance: This accounting period is closed.') END;
 SELECT CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM finance_documents p WHERE p.id=NEW.parent_id AND p.status='posted' AND ((NEW.kind='sale_credit' AND p.kind='sale') OR (NEW.kind='purchase_credit' AND p.kind IN ('purchase','expense'))) AND NEW.document_date>=p.document_date AND json_extract(NEW.data,'$.party')=json_extract(p.data,'$.party') AND json_extract(NEW.data,'$.gstin')=json_extract(p.data,'$.gstin') AND json_extract(NEW.data,'$.supply')=json_extract(p.data,'$.supply')) THEN RAISE(ABORT,'finance: Credit must match an active source document, party and tax treatment.') END;
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
 SELECT CASE WHEN OLD.document_date <= (SELECT closed_through FROM finance_profile WHERE id=1) AND NOT(NEW.status=OLD.status AND NEW.kind IN ('sale','sale_credit') AND json_extract(OLD.data,'$.export') IS NOT NULL AND json_remove(NEW.data,'$.export.lut','$.export.shippingBill','$.export.shippingDate','$.export.port','$.export.rateEvidence','$.export.realisationDue')=json_remove(OLD.data,'$.export.lut','$.export.shippingBill','$.export.shippingDate','$.export.port','$.export.rateEvidence','$.export.realisationDue')) THEN RAISE(ABORT,'finance: This accounting period is closed.') END;
 SELECT CASE WHEN OLD.status='void' OR NEW.id<>OLD.id OR NEW.reference_key<>OLD.reference_key OR NEW.fingerprint<>OLD.fingerprint OR NEW.created_at<>OLD.created_at THEN RAISE(ABORT,'finance: Posted source records are immutable.') END;
 SELECT CASE WHEN NEW.status='void' AND (NEW.data<>OLD.data OR length(trim(NEW.void_reason))<3 OR EXISTS(SELECT 1 FROM finance_settlements WHERE document_id=OLD.id) OR EXISTS(SELECT 1 FROM finance_documents WHERE parent_id=OLD.id AND status='posted')) THEN RAISE(ABORT,'finance: Settle dependent payments/credits through corrections before voiding; a reason is required.') END;
 SELECT CASE WHEN NEW.status='posted' AND NOT(NEW.data<>OLD.data AND length(trim(NEW.change_reason))>=3 AND ((OLD.cost_minor IS NULL AND NEW.cost_minor IS NOT NULL AND NEW.kind IN ('sale','sale_credit') AND json_remove(NEW.data,'$.costMinor')=json_remove(OLD.data,'$.costMinor')) OR (NEW.kind IN ('purchase','expense','purchase_credit') AND json_remove(NEW.data,'$.itcStatus','$.reviewNote')=json_remove(OLD.data,'$.itcStatus','$.reviewNote')) OR (NEW.kind IN ('sale','sale_credit') AND json_extract(OLD.data,'$.export') IS NOT NULL AND json_remove(NEW.data,'$.export.lut','$.export.shippingBill','$.export.shippingDate','$.export.port','$.export.rateEvidence','$.export.realisationDue')=json_remove(OLD.data,'$.export.lut','$.export.shippingBill','$.export.shippingDate','$.export.port','$.export.rateEvidence','$.export.realisationDue')))) THEN RAISE(ABORT,'finance: Only missing sales cost or documented input-tax review may change.') END;
 SELECT CASE WHEN NEW.status='posted' AND NEW.kind='sale' AND NEW.cost_minor<COALESCE((SELECT SUM(cost_minor) FROM finance_documents WHERE parent_id=OLD.id AND status='posted'),0) THEN RAISE(ABORT,'finance: Cost cannot be below its existing credit costs.') END;
 SELECT CASE WHEN NEW.status='posted' AND NEW.kind='sale_credit' AND EXISTS(SELECT 1 FROM finance_documents p WHERE p.id=NEW.parent_id AND p.cost_minor IS NOT NULL AND NEW.cost_minor+COALESCE((SELECT SUM(cost_minor) FROM finance_documents c WHERE c.parent_id=p.id AND c.id<>NEW.id AND c.status='posted'),0)>p.cost_minor) THEN RAISE(ABORT,'finance: Credit cost exceeds the source cost.') END;
END;

DROP TRIGGER finance_document_change_audit;
CREATE TRIGGER finance_document_change_audit AFTER UPDATE ON finance_documents BEGIN
 INSERT INTO finance_audit(entity_id,action,detail) VALUES(NEW.id,CASE WHEN NEW.status='void' THEN 'document_voided' WHEN OLD.cost_minor IS NULL AND NEW.cost_minor IS NOT NULL THEN 'cost_completed' WHEN json_remove(NEW.data,'$.itcStatus','$.reviewNote')=json_remove(OLD.data,'$.itcStatus','$.reviewNote') THEN 'input_tax_reviewed' ELSE 'export_evidence_updated' END,CASE WHEN NEW.status='void' THEN NEW.void_reason ELSE NEW.change_reason END);
END;
