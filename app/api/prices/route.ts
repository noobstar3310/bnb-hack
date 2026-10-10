/**
 * GET /api/prices?vault=0x…
 *
 * Returns a freshly signed PriceUpdate for every stock the vault holds, ready to pass to
 * `vault.deposit(amount, update, signature, minShares)`. Valid for 60 seconds, so fetch it
 * right before sending the deposit. Amounts are strings (raw base units).
 */
import {errorResponse} from '@/lib/chain/server';
import {signPricesForVault} from '@/lib/pricing/signer';

export async function GET(request: Request) {
  const vault = new URL(request.url).searchParams.get('vault') ?? '';
  try {
    return Response.json(await signPricesForVault(vault), {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return errorResponse(error, 'api/prices');
  }
}
