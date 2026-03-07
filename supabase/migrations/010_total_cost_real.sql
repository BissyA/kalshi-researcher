-- Change total_cost_cents from INTEGER to REAL to support sub-cent precision
-- (e.g. market order fills with fractional cent averages like 11.6¢)
ALTER TABLE trades ALTER COLUMN total_cost_cents TYPE REAL;
