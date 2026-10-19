-- Illustrative local products, not Lenore business data. Never run remotely.
INSERT OR IGNORE INTO products(id,slug,code,name,category,unit,description,price_paise,stock,low_stock,published,last_actor,bin) VALUES
('11111111-1111-4111-8111-111111111111','single-lever-basin-mixer-demo-bm01','DEMO-BM01','Single lever basin mixer','Basin mixers','pcs','Illustrative product. Replace this record with verified Lenore product details.',485000,24,5,1,'local-demo','A-01'),
('22222222-2222-4222-8222-222222222222','overhead-shower-demo-sh02','DEMO-SH02','Overhead shower','Showers','pcs','Illustrative product. Product photography and specifications are pending.',725000,4,5,1,'local-demo','B-04'),
('33333333-3333-4333-8333-333333333333','wall-mounted-bib-tap-demo-tp03','DEMO-TP03','Wall mounted bib tap','Taps','pcs','Illustrative product. Replace this record before publishing a real catalogue.',165000,0,5,1,'local-demo','A-07'),
('44444444-4444-4444-8444-444444444444','towel-rail-demo-ac04','DEMO-AC04','Towel rail','Accessories','pcs','Illustrative product for testing catalogue and inventory workflows.',219000,32,5,1,'local-demo','C-02'),
('55555555-5555-4555-8555-555555555555','countertop-wash-basin-demo-sw05','DEMO-SW05','Countertop wash basin','Sanitary ware','pcs','Illustrative draft. Not visible in the public catalogue until published.',NULL,8,5,0,'local-demo',''),
('66666666-6666-4666-8666-666666666666','hand-shower-set-demo-hs06','DEMO-HS06','Hand shower set','Showers','pcs','Illustrative draft. Add verified photos, details and pricing before publishing.',NULL,2,5,0,'local-demo','');
-- Earlier local databases: give demo records readable links and sample prices once.
UPDATE products SET slug=lower(replace(name,' ','-'))||'-'||lower(code), price_paise=COALESCE(price_paise, CASE code
  WHEN 'DEMO-BM01' THEN 485000 WHEN 'DEMO-SH02' THEN 725000 WHEN 'DEMO-TP03' THEN 165000 WHEN 'DEMO-AC04' THEN 219000 END),
  last_actor='local-demo'
WHERE code LIKE 'DEMO-%' AND slug=lower(code);
