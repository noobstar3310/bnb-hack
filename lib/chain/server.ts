/**
 * Server-side chain access for Route Handlers. CHAIN_RPC_URL points at the local anvil in
 * development (.env.local) and at BSC in production; BSC_RPC_URL is the fallback.
 */
import {createPublicClient, http} from 'viem';

/** A failure a Route Handler can return as-is; `status` is the HTTP status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function publicClient() {
  const url = process.env.CHAIN_RPC_URL || process.env.BSC_RPC_URL;
  if (!url) throw new ApiError('CHAIN_RPC_URL is not configured', 500);
  return createPublicClient({transport: http(url)});
}

/** Shapes any thrown value into a JSON Response, logging what is not an ApiError. */
export function errorResponse(error: unknown, route: string): Response {
  const headers = {'Cache-Control': 'no-store'};
  if (error instanceof ApiError) {
    return Response.json({error: error.message, details: error.details}, {status: error.status, headers});
  }
  console.error(`[${route}]`, error);
  return Response.json({error: 'Unexpected server error'}, {status: 500, headers});
}
