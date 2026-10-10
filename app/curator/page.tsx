import type {Metadata} from 'next';
import {CuratorConsole} from '@/components/curator/CuratorConsole';

export const metadata: Metadata = {
  title: 'Curator console â€” Folio Lab',
  description: 'Create, fund and rebalance a transparent tokenized-stock vault.',
};

export default function CuratorPage() {
  return <CuratorConsole />;
}
