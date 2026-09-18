const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function money(value: number): string {
  return currency.format(value);
}

export function pct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/** Rounds down to whole cents, so "use max" never exceeds the real limit. */
export function floorToCents(value: number): string {
  return (Math.floor((value + 1e-8) * 100) / 100).toFixed(2);
}
