import type { Vault } from '@/lib/domain/vault';

/** Share-price line across the market moves applied so far. */
export function PriceChart({ vault }: { vault: Vault }) {
  const points = vault.history.length < 2 ? [10, 10] : vault.history;
  const low = Math.min(...points) - 0.15;
  const high = Math.max(...points) + 0.15;

  const path = points
    .map((n, i) => `${(i / (points.length - 1)) * 280},${68 - ((n - low) / (high - low)) * 58}`)
    .join(' ');

  return (
    <svg
      viewBox="0 0 280 78"
      role="img"
      aria-label={`Simulated share price over ${vault.history.length - 1} market moves`}
      className="my-[14px] mb-1 h-[78px] w-full"
    >
      <path d="M0 68H280" stroke="#e8edf3" />
      <polyline
        points={path}
        fill="none"
        stroke="#587ec2"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
