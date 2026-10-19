-- Payment details for bills: the shop's UPI ID for scan-to-pay QR codes and
-- bank details for transfers, set by admins under Billing settings.
ALTER TABLE erp_settings ADD COLUMN upi_id TEXT NOT NULL DEFAULT '';
ALTER TABLE erp_settings ADD COLUMN upi_name TEXT NOT NULL DEFAULT '';
ALTER TABLE erp_settings ADD COLUMN bank_account_name TEXT NOT NULL DEFAULT '';
ALTER TABLE erp_settings ADD COLUMN bank_name TEXT NOT NULL DEFAULT '';
ALTER TABLE erp_settings ADD COLUMN bank_account TEXT NOT NULL DEFAULT '';
ALTER TABLE erp_settings ADD COLUMN bank_ifsc TEXT NOT NULL DEFAULT '';
ALTER TABLE erp_settings ADD COLUMN bank_branch TEXT NOT NULL DEFAULT '';
-- When the UPI QR prints on bills: never, only while an amount is due, or always.
ALTER TABLE erp_settings ADD COLUMN qr_on_bills TEXT NOT NULL DEFAULT 'due'
  CHECK(qr_on_bills IN ('off', 'due', 'always'));
ALTER TABLE erp_settings ADD COLUMN bank_on_invoice INTEGER NOT NULL DEFAULT 1
  CHECK(bank_on_invoice IN (0, 1));
