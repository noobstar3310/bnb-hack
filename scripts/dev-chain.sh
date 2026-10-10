#!/usr/bin/env bash
# Deploys Folio Lab to a plain local anvil (no fork). Mock tokens are planted at the REAL BSC
# addresses of USDT and the Ondo stocks, so Binance price lookups by address work unchanged.
#
# Usage:  anvil --block-time 1      (in another terminal)
#         scripts/dev-chain.sh
# Then set CHAIN_RPC_URL=http://127.0.0.1:8545 in .env.local. Needs PRICE_SIGNER_PRIVATE_KEY in .env.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$PATH:$HOME/.foundry/bin"
cd "$ROOT/contracts"
set -a; . "$ROOT/.env"; set +a

RPC=http://127.0.0.1:8545
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil account 0
ME=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
USDT=0x55d398326f99059fF775485246999027B3197955
AAPL=0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4
NVDA=0xa9ee28c80f960b889dfbd1902055218cba016f75
MSFT=0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3
SIGNER=$(cast wallet address "$PRICE_SIGNER_PRIVATE_KEY")

dep() { local c=$1; shift; forge create "$c" --rpc-url $RPC --private-key $PK --broadcast --constructor-args "$@" 2>&1 | awk '/Deployed to/{print $3}'; }
send() { cast send --rpc-url $RPC --private-key $PK "$@" >/dev/null; }
plant() { # plant <real address> <symbol>: copy a fresh 18-decimal MockERC20's code to the real address
  local tmp; tmp=$(dep test/mocks/MockERC20.sol:MockERC20 "$2" "$2" 18)
  cast rpc --rpc-url $RPC anvil_setCode "$1" "$(cast code --rpc-url $RPC "$tmp")" >/dev/null
}

plant $USDT USDT; plant $AAPL AAPLon; plant $NVDA NVDAon; plant $MSFT MSFTon
send $USDT "mint(address,uint256)" $ME 1000000000000000000000000   # 1,000,000 USDT

REG=$(dep src/AssetRegistry.sol:AssetRegistry $ME $ME $USDT)
FAC=$(dep src/VaultFactory.sol:VaultFactory "$REG")
send "$REG" "setPriceSigner(address)" "$SIGNER"
for t in $AAPL $NVDA $MSFT; do send "$REG" "setAsset(address,bool)" $t true; done

send "$FAC" "createVault(string,string,address)" "Mag Tech" "MAGT" $ME
V=$(cast call --rpc-url $RPC "$FAC" "vaults(uint256)(address)" 0)
send $USDT "approve(address,uint256)" "$V" 1000000000000000000000
send "$V" "seed(uint256)" 100000000000000000000                    # 100 USDT
send "$V" "activate()"

echo "REGISTRY=$REG"
echo "FACTORY=$FAC"
echo "VAULT=$V"
echo "state=$(cast call --rpc-url $RPC "$V" 'state()(uint8)') supply=$(cast call --rpc-url $RPC "$V" 'totalSupply()(uint256)')"
