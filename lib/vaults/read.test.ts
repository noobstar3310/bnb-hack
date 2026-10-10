import {describe, expect, it} from 'vitest';
import {toTarget} from './read';

const AAPL = '0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4';
const NVDA = '0xA9eE28C80f960B889dFbd1902055218cBa016F75';
const symbol = (a: string) => (a === AAPL ? 'AAPLon' : 'NVDAon');

describe('toTarget', () => {
  it('pairs assets with their weights and symbols', () => {
    expect(toTarget([AAPL, NVDA], [6000, 4000], BigInt(2), symbol)).toEqual({
      version: 2,
      weights: [
        {asset: AAPL, symbol: 'AAPLon', bps: 6000},
        {asset: NVDA, symbol: 'NVDAon', bps: 4000},
      ],
    });
  });

  it('treats version 0 or an empty list as unpublished', () => {
    expect(toTarget([], [], BigInt(0), symbol)).toBeNull();
    expect(toTarget([AAPL], [10000], BigInt(0), symbol)).toBeNull();
  });

  it('rejects mismatched arrays', () => {
    expect(toTarget([AAPL, NVDA], [10000], BigInt(1), symbol)).toBeNull();
  });
});
