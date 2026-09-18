'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ASSETS,
  OPENING_BALANCE,
  applyMarketMove,
  createVault,
  recordHistory,
  seedVaults,
  transact,
  type Asset,
  type RiskLabel,
  type TradeType,
  type Vault,
} from '@/lib/domain/vault';

export type ViewMode = 'explore' | 'positions';
export type ExposureFilter = 'all' | RiskLabel;

interface State {
  assets: Asset[];
  vaults: Vault[];
  balance: number;
  selectedId: string;
  mode: ViewMode;
  filter: ExposureFilter;
}

type Action =
  | { type: 'select'; id: string }
  | { type: 'setMode'; mode: ViewMode }
  | { type: 'setFilter'; filter: ExposureFilter }
  | { type: 'createVault'; name: string; thesis: string; weights: number[] }
  | { type: 'transact'; id: string; tradeType: TradeType; amount: number }
  | { type: 'marketMove'; change: number };

function initialState(): State {
  return {
    assets: ASSETS.map((a) => ({ ...a })),
    vaults: seedVaults(),
    balance: OPENING_BALANCE,
    selectedId: 'core',
    mode: 'explore',
    filter: 'all',
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'select': {
      if (!state.vaults.some((v) => v.id === action.id)) {
        throw new Error('Unknown strategy.');
      }
      return { ...state, selectedId: action.id };
    }

    case 'setMode':
      return { ...state, mode: action.mode };

    case 'setFilter':
      return { ...state, filter: action.filter };

    case 'createVault': {
      const vault = createVault({
        name: action.name,
        thesis: action.thesis,
        weights: action.weights,
        assets: state.assets,
      });
      return {
        ...state,
        vaults: [...state.vaults, vault],
        selectedId: vault.id,
        mode: 'explore',
        filter: 'all',
      };
    }

    case 'transact': {
      const vault = state.vaults.find((v) => v.id === action.id);
      if (!vault) throw new Error('Unknown strategy.');

      const result = transact({
        vault,
        assets: state.assets,
        type: action.tradeType,
        amount: action.amount,
        balance: state.balance,
      });

      return {
        ...state,
        vaults: state.vaults.map((v) => (v.id === action.id ? result.vault : v)),
        balance: result.balance,
      };
    }

    case 'marketMove': {
      const assets = applyMarketMove(state.assets, action.change);
      return {
        ...state,
        assets,
        vaults: state.vaults.map((v) => recordHistory(v, assets)),
      };
    }
  }
}

interface StoreValue extends State {
  selected: Vault;
  invested: number;
  total: number;
  dispatch: (action: Action) => void;
  toast: string | null;
  notify: (message: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const TOAST_MS = 4500;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo<StoreValue>(() => {
    const priceOf = (v: Vault) =>
      v.units.reduce((total, units, i) => total + units * state.assets[i].price, 0) / v.supply;
    const invested = state.vaults.reduce((sum, v) => sum + v.userShares * priceOf(v), 0);

    return {
      ...state,
      selected: state.vaults.find((v) => v.id === state.selectedId) ?? state.vaults[0],
      invested,
      total: state.balance + invested,
      dispatch,
      toast,
      notify,
    };
  }, [state, toast, notify]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider.');
  return ctx;
}
