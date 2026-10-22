-- Quotations can name a saved customer, so their price list applies and the
-- bill made from the quotation is linked to the same customer.
ALTER TABLE quotations ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
