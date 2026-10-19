-- Stage B: counter billing (POS) and ERP. Sales, returns and purchases post
-- stock through stock_movements and accounting through the finance subledger.

ALTER TABLE staff_users ADD COLUMN pos_access INTEGER NOT NULL DEFAULT 0 CHECK(pos_access IN (0, 1));

CREATE TABLE erp_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  invoice_prefix TEXT NOT NULL DEFAULT 'LT' CHECK(length(invoice_prefix) BETWEEN 1 AND 4),
  state_code TEXT NOT NULL DEFAULT '32',
  receipt_footer TEXT NOT NULL DEFAULT 'Thank you for shopping at Lenore. Goods once sold are exchanged only with the original bill.',
  block_size INTEGER NOT NULL DEFAULT 25 CHECK(block_size BETWEEN 5 AND 200),
  revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO erp_settings(id) VALUES(1);

CREATE TABLE price_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  discount_bp INTEGER NOT NULL DEFAULT 0 CHECK(discount_bp BETWEEN 0 AND 10000),
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE price_list_items (
  price_list_id TEXT NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  price_paise INTEGER NOT NULL CHECK(price_paise >= 0),
  PRIMARY KEY (price_list_id, product_id)
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  gstin TEXT NOT NULL DEFAULT '',
  state_code TEXT NOT NULL DEFAULT '32',
  address TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'retail' CHECK(kind IN ('retail', 'dealer', 'contractor')),
  price_list_id TEXT REFERENCES price_lists(id) ON DELETE SET NULL,
  credit_limit_paise INTEGER NOT NULL DEFAULT 0 CHECK(credit_limit_paise >= 0),
  notes TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX customers_phone_lookup ON customers(phone);
CREATE INDEX customers_name ON customers(name COLLATE NOCASE);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  gstin TEXT NOT NULL DEFAULT '',
  state_code TEXT NOT NULL DEFAULT '32',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Invoice numbers are reserved to a counter device in blocks, so billing can
-- continue through short outages with legally consecutive numbers.
CREATE TABLE number_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  fy TEXT NOT NULL,
  first_seq INTEGER NOT NULL,
  last_seq INTEGER NOT NULL CHECK(last_seq >= first_seq),
  issued_to TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX number_blocks_device ON number_blocks(device_id, fy);

CREATE TABLE shifts (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  opened_by TEXT NOT NULL,
  opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  opening_float INTEGER NOT NULL CHECK(opening_float >= 0),
  closed_by TEXT,
  closed_at TEXT,
  expected_cash INTEGER,
  counted_cash INTEGER,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX shifts_one_open ON shifts(device_id) WHERE status = 'open';
CREATE TABLE cash_movements (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL REFERENCES shifts(id),
  kind TEXT NOT NULL CHECK(kind IN ('in', 'out')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  fy TEXT NOT NULL,
  seq INTEGER NOT NULL,
  request_hash TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued', 'cancelled')),
  customer_id TEXT REFERENCES customers(id),
  customer_json TEXT NOT NULL CHECK(json_valid(customer_json)),
  supply TEXT NOT NULL CHECK(supply IN ('intra', 'inter')),
  place_of_supply TEXT NOT NULL,
  taxable INTEGER NOT NULL,
  cgst INTEGER NOT NULL,
  sgst INTEGER NOT NULL,
  igst INTEGER NOT NULL,
  round_off INTEGER NOT NULL,
  total INTEGER NOT NULL CHECK(total >= 0),
  paid INTEGER NOT NULL DEFAULT 0 CHECK(paid >= 0),
  credited INTEGER NOT NULL DEFAULT 0 CHECK(credited >= 0),
  refunded INTEGER NOT NULL DEFAULT 0 CHECK(refunded >= 0),
  shift_id TEXT REFERENCES shifts(id),
  device_id TEXT NOT NULL,
  cashier TEXT NOT NULL,
  quotation_id TEXT,
  shortfall INTEGER NOT NULL DEFAULT 0,
  offline INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (fy, seq),
  CHECK(credited <= total)
);
CREATE INDEX invoices_date ON invoices(date);
CREATE INDEX invoices_customer ON invoices(customer_id, date);
CREATE TABLE invoice_lines (
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  line_no INTEGER NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  hsn TEXT NOT NULL,
  unit TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  mrp INTEGER,
  rate INTEGER NOT NULL,
  discount INTEGER NOT NULL,
  gst_rate_bp INTEGER NOT NULL,
  taxable INTEGER NOT NULL,
  cgst INTEGER NOT NULL,
  sgst INTEGER NOT NULL,
  igst INTEGER NOT NULL,
  total INTEGER NOT NULL,
  cost_paise INTEGER,
  returned_qty INTEGER NOT NULL DEFAULT 0,
  returned_total INTEGER NOT NULL DEFAULT 0,
  returned_taxable INTEGER NOT NULL DEFAULT 0,
  returned_cgst INTEGER NOT NULL DEFAULT 0,
  returned_sgst INTEGER NOT NULL DEFAULT 0,
  returned_igst INTEGER NOT NULL DEFAULT 0,
  unposted_qty INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (invoice_id, line_no),
  CHECK(returned_qty <= qty)
);
CREATE INDEX invoice_lines_product ON invoice_lines(product_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  kind TEXT NOT NULL CHECK(kind IN ('sale', 'receipt', 'refund')),
  method TEXT NOT NULL CHECK(method IN ('cash', 'upi', 'card', 'bank')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  date TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  shift_id TEXT REFERENCES shifts(id),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX payments_invoice ON payments(invoice_id);
CREATE INDEX payments_shift ON payments(shift_id);
CREATE INDEX payments_date ON payments(date);

CREATE TABLE credit_notes (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  date TEXT NOT NULL,
  reason TEXT NOT NULL,
  restock INTEGER NOT NULL,
  lines_json TEXT NOT NULL CHECK(json_valid(lines_json)),
  taxable INTEGER NOT NULL,
  cgst INTEGER NOT NULL,
  sgst INTEGER NOT NULL,
  igst INTEGER NOT NULL,
  total INTEGER NOT NULL CHECK(total > 0),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX credit_notes_invoice ON credit_notes(invoice_id);

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  bill_number TEXT NOT NULL,
  date TEXT NOT NULL,
  supply TEXT NOT NULL CHECK(supply IN ('intra', 'inter')),
  lines_json TEXT NOT NULL CHECK(json_valid(lines_json)),
  taxable INTEGER NOT NULL,
  cgst INTEGER NOT NULL,
  sgst INTEGER NOT NULL,
  igst INTEGER NOT NULL,
  round_off INTEGER NOT NULL,
  total INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0 CHECK(paid >= 0 AND paid <= total),
  notes TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (supplier_id, bill_number)
);
CREATE INDEX purchases_date ON purchases(date);
CREATE TABLE supplier_payments (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  method TEXT NOT NULL CHECK(method IN ('cash', 'upi', 'card', 'bank')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  date TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Issued tax documents are permanent; corrections use credit notes.
CREATE TRIGGER invoices_no_delete BEFORE DELETE ON invoices BEGIN
  SELECT RAISE(ABORT, 'Invoices cannot be deleted. Issue a credit note.');
END;
CREATE TRIGGER invoice_lines_no_delete BEFORE DELETE ON invoice_lines BEGIN
  SELECT RAISE(ABORT, 'Invoice lines cannot be deleted.');
END;
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments BEGIN
  SELECT RAISE(ABORT, 'Payments cannot be deleted.');
END;
CREATE TRIGGER credit_notes_no_delete BEFORE DELETE ON credit_notes BEGIN
  SELECT RAISE(ABORT, 'Credit notes cannot be deleted.');
END;

-- Stock movements may now come from sales and purchases.
CREATE TRIGGER stock_movement_kind_guard BEFORE INSERT ON stock_movements
WHEN NEW.kind = 'sale' AND NEW.delta > 0 BEGIN
  SELECT RAISE(ABORT, 'A sale cannot add stock.');
END;

-- Supplier returns (debit notes) against purchases.
ALTER TABLE purchases ADD COLUMN returned INTEGER NOT NULL DEFAULT 0;
CREATE TABLE purchase_returns (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  date TEXT NOT NULL,
  reason TEXT NOT NULL,
  lines_json TEXT NOT NULL CHECK(json_valid(lines_json)),
  taxable INTEGER NOT NULL,
  cgst INTEGER NOT NULL,
  sgst INTEGER NOT NULL,
  igst INTEGER NOT NULL,
  total INTEGER NOT NULL CHECK(total > 0),
  refund_method TEXT,
  refund_amount INTEGER NOT NULL DEFAULT 0,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Operating expenses. The finance subledger holds the accounting record;
-- this table keeps operational detail (payee, cash drawer, bill photo).
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  payee TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  bill_number TEXT NOT NULL DEFAULT '',
  gstin TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL CHECK(amount > 0),
  gst INTEGER NOT NULL DEFAULT 0 CHECK(gst >= 0 AND gst < amount),
  method TEXT NOT NULL CHECK(method IN ('cash', 'upi', 'card', 'bank', 'unpaid')),
  reference TEXT NOT NULL DEFAULT '',
  shift_id TEXT REFERENCES shifts(id),
  attachment_key TEXT,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded', 'reversed')),
  reversal_reason TEXT NOT NULL DEFAULT '',
  paid INTEGER NOT NULL DEFAULT 0,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX expenses_date ON expenses(date);
CREATE TRIGGER expenses_no_delete BEFORE DELETE ON expenses BEGIN
  SELECT RAISE(ABORT, 'Expenses cannot be deleted. Reverse them instead.');
END;
