/**
 * GET /api/vaults
 *
 * Every vault the factory created, newest first, with holdings valued at Binance prices for
 * display. A total of null means some holding has no price — show it as unavailable, not $0.
 */
import {errorResponse} from '@/lib/chain/server';
import {listVaults} from '@/lib/vaults/read';

export async function GET() {
  try {
    return Response.json({vaults: await listVaults()}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return errorResponse(error, 'api/vaults');
  }
}
