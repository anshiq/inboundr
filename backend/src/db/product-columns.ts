import type { EDITABLE_PRODUCT_COLUMNS } from "../services/product.service";

/**
 * How a product column's JS value must be encoded before it is bound as a
 * query parameter.
 *
 * node-pg serializes JS arrays as Postgres array literals (`{"a","b"}`), which
 * is correct for `TEXT[]` columns but produces invalid JSON for `jsonb` ones.
 * Objects survive by accident because node-pg falls back to `JSON.stringify`,
 * so only arrays fail loudly — an empty array silently encodes to `{}` and
 * stores an object where an array belongs.
 */
export type ColumnEncoding = "jsonbObject" | "jsonbArray" | "native";

type ProductColumn = (typeof EDITABLE_PRODUCT_COLUMNS)[number] | "organization_id";

/**
 * Exhaustive by construction: adding a column to `EDITABLE_PRODUCT_COLUMNS`
 * without recording an encoding here is a compile error.
 */
export const PRODUCT_COLUMN_ENCODING: Record<ProductColumn, ColumnEncoding> = {
  organization_id: "native",
  brand: "native",
  maxdiscount: "native",
  productdescription: "native",
  productcode: "native",
  unitprice: "native",
  hsncode: "native",
  gstrate: "native",
  productlink: "native",
  maxupsell: "native",
  calibrationcharges: "native",
  unit: "native",
  is_top_seller: "native",
  category: "native",
  tags: "native",
  attributes: "jsonbObject",
  default_adjustments: "jsonbArray",
  pricing_policy: "jsonbObject",
  addedtime: "native",
  addeduser: "native",
};

export function encodeProductValue(column: string, value: unknown): unknown {
  const encoding = PRODUCT_COLUMN_ENCODING[column as ProductColumn] ?? "native";

  if (encoding === "native" || typeof value === "string") {
    return value;
  }

  return JSON.stringify(value ?? (encoding === "jsonbArray" ? [] : {}));
}

export function encodeProductValues(
  columns: readonly string[],
  values: readonly unknown[]
): unknown[] {
  return values.map((value, index) => encodeProductValue(columns[index]!, value));
}
