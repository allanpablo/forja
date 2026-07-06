// Math utilities
export function roundToTwoDecimals(num: number): number {
  return Math.round(num * 100) / 100;
}

// Calculate total
export function calculateTotal(items: Array<{ price: number; quantity: number }>): number {
  return roundToTwoDecimals(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
}

// Calculate discount
export function calculateDiscount(original: number, discountPercent: number): number {
  return roundToTwoDecimals(original * (discountPercent / 100));
}

// Calculate tax
export function calculateTax(amount: number, taxPercent: number): number {
  return roundToTwoDecimals(amount * (taxPercent / 100));
}

// Clamp number between min and max
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Generate random ID
export function generateId(prefix = ''): string {
  const id = Math.random().toString(36).substring(2, 11);
  return prefix ? `${prefix}_${id}` : id;
}
