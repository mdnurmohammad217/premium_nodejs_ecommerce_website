/**
 * Wholesale min/max quantities, checked before the order is sent (the server
 * checks again and has the final word). A product's option lines count
 * together toward its limits.
 */
export const wholesaleQuantityProblems = (items: any[]): string[] => {
  const totals = new Map<number, { name: string; qty: number; min: number; max: number }>();
  items.forEach((item) => {
    const product = item?.product || {};
    if (!product.isWholesale) return;
    const entry = totals.get(product.id) || {
      name: product.name,
      qty: 0,
      min: Number(product.wholesaleMinQty) || 0,
      max: Number(product.wholesaleMaxQty) || 0,
    };
    entry.qty += Number(item.quantity) || 0;
    totals.set(product.id, entry);
  });
  const problems: string[] = [];
  totals.forEach((entry) => {
    if (entry.min && entry.qty < entry.min) problems.push(`"${entry.name}": minimum wholesale quantity is ${entry.min}.`);
    if (entry.max && entry.qty > entry.max) problems.push(`"${entry.name}": maximum wholesale quantity is ${entry.max}.`);
  });
  return problems;
};

/** Business types offered on the wholesale registration form */
export const BUSINESS_TYPES = [
  'Pharmacy / Medicine Shop',
  'Clinic / Diagnostic Centre',
  'Hospital',
  'Distributor / Wholesaler',
  'Corporate / Institution',
  'Other',
];
