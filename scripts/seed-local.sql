-- Illustrative local products, not Lenore business data. Never run remotely.
INSERT OR IGNORE INTO products(id,code,name,category,unit,description,price_paise,stock,low_stock,published,last_actor) VALUES
('11111111-1111-4111-8111-111111111111','DEMO-BM01','Single lever basin mixer','Basin mixers','pcs','Illustrative product. Replace this record with verified Lenore product details.',NULL,24,5,1,'local-demo'),
('22222222-2222-4222-8222-222222222222','DEMO-SH02','Overhead shower','Showers','pcs','Illustrative product. Product photography and specifications are pending.',NULL,4,5,1,'local-demo'),
('33333333-3333-4333-8333-333333333333','DEMO-TP03','Wall mounted bib tap','Taps','pcs','Illustrative product. Replace this record before publishing a real catalogue.',NULL,0,5,1,'local-demo'),
('44444444-4444-4444-8444-444444444444','DEMO-AC04','Towel rail','Accessories','pcs','Illustrative product for testing catalogue and inventory workflows.',NULL,32,5,1,'local-demo'),
('55555555-5555-4555-8555-555555555555','DEMO-SW05','Countertop wash basin','Sanitary ware','pcs','Illustrative draft. Not visible in the public catalogue until published.',NULL,8,5,0,'local-demo'),
('66666666-6666-4666-8666-666666666666','DEMO-HS06','Hand shower set','Showers','pcs','Illustrative draft. Add verified photos, details and pricing before publishing.',NULL,2,5,0,'local-demo');
