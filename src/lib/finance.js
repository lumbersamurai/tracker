import { Wallet, CreditCard, PiggyBank, Banknote, Landmark } from 'lucide-react';

export const ACCOUNT_TYPES = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote, color: '#7FD17F' },
  { id: 'debito', label: 'Cuenta de débito', icon: Wallet, color: '#6E9FD1' },
  { id: 'credito', label: 'Cuenta de crédito', icon: CreditCard, color: '#E3A66A' },
  { id: 'ahorro', label: 'Ahorro', icon: PiggyBank, color: '#9D7FE8' },
  { id: 'otro', label: 'Otro', icon: Landmark, color: 'var(--text-secondary)' },
];

export function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function formatMXN(amount) {
  const sign = amount < 0 ? '-' : '';
  return sign + '$' + Math.abs(amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDateLabel(date) {
  return new Date(date + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function typeMeta(typeId) {
  return ACCOUNT_TYPES.find(type => type.id === typeId) || ACCOUNT_TYPES[4];
}

export function movementDelta(movement, accountType) {
  if (accountType === 'credito') return movement.tipo === 'gasto' ? movement.monto : -movement.monto;
  return movement.tipo === 'gasto' ? -movement.monto : movement.monto;
}
