ALTER TABLE activity ADD COLUMN reason TEXT;

DROP TRIGGER product_changed;
CREATE TRIGGER product_changed AFTER UPDATE ON products BEGIN
  INSERT INTO activity(product_id, actor, action, detail, reason)
  VALUES(NEW.id, NEW.last_actor,
    CASE WHEN NEW.stock != OLD.stock THEN 'Stock changed'
         WHEN NEW.published != OLD.published THEN 'Publication changed'
         ELSE 'Product updated' END,
    NEW.code || ' · ' || CASE WHEN NEW.stock != OLD.stock
      THEN OLD.stock || ' → ' || NEW.stock ELSE NEW.name END,
    CASE WHEN NEW.stock != OLD.stock THEN (
      SELECT reason FROM stock_movements
      WHERE product_id=NEW.id AND expected_revision=OLD.revision
        AND previous_stock=OLD.stock AND new_stock=NEW.stock
    ) ELSE NULL END);
END;
