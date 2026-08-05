import { X } from 'lucide-react';
import { formatMXN } from '../lib/finance';

export default function AdjustmentModal({ form, error, saving, onChange, onClose, onSubmit }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20 }} onClick={onClose}>
      <form onSubmit={onSubmit} onClick={event => event.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', padding: 22, paddingBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Ajustar saldo real</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none' }}><X size={20} color="var(--text-secondary)" /></button>
        </div>
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          El saldo actual calculado es de <strong style={{ color: 'var(--text-primary)' }}>{formatMXN(form.currentBalance)}</strong>.<br />
          Ingresa cuánto dinero tienes realmente y crearemos un movimiento automático para cuadrar tus cuentas.
        </div>
        <input placeholder="Nuevo saldo exacto (MXN)" type="number" step="0.01" inputMode="decimal" value={form.newBalance} onChange={event => onChange(event.target.value)} className="field" style={{ marginBottom: 14 }} />
        {error && <div style={{ color: '#E36A6A', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <button type="submit" disabled={saving} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14.5, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Calculando y guardando…' : 'Crear ajuste automático'}
        </button>
      </form>
    </div>
  );
}
