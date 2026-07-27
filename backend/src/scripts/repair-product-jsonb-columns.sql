-- Repairs default_adjustments rows written before jsonb values were encoded at
-- the query boundary. node-pg encoded an empty JS array as the Postgres array
-- literal '{}', which Postgres accepted as a valid (but wrong) JSON object.
UPDATE products
SET default_adjustments = '[]'::jsonb
WHERE jsonb_typeof(default_adjustments) = 'object'
  AND default_adjustments = '{}'::jsonb;

-- Only '{}' could have made it past Postgres, so anything still non-array has a
-- different cause. Surface it rather than rewriting it blindly.
SELECT id::text AS id, organization_id, default_adjustments
FROM products
WHERE jsonb_typeof(default_adjustments) <> 'array';
