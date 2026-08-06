-- Document that per_user_budget_usd stores INR after USD→INR conversion
-- (Azure Cost Management billing currency). Column name kept for compatibility.
COMMENT ON COLUMN requests.per_user_budget_usd IS
  'Per-user budget amount in Azure billing currency (INR). UI collects USD and converts at create/renew using USD_TO_INR_RATE.';
