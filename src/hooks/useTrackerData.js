import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

function mapAccount(account) {
  return { id: account.id, name: account.nombre, type: account.tipo, initialBalance: Number(account.saldo_inicial) || 0, diaCorte: account.dia_corte || null, diaPago: account.dia_pago || null };
}

function mapDay(day, transactions) {
  return {
    id: day.id, fecha: day.fecha, sinCambios: day.sin_cambios, nota: day.nota || '',
    movimientos: transactions.filter(transaction => transaction.dia_id === day.id).map(transaction => ({ id: transaction.id, tipo: transaction.tipo, monto: Number(transaction.monto), cuentaId: transaction.cuenta_id, descripcion: transaction.descripcion || '' })),
  };
}

export function useTrackerData(session) {
  const [accounts, setAccounts] = useState([]);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const requestRef = useRef(0);

  async function loadAll(userId) {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const [accountsResult, daysResult, transactionsResult] = await Promise.all([
        supabase.from('cuentas').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('dias').select('*').eq('user_id', userId).order('fecha', { ascending: false }),
        supabase.from('transacciones').select('*').eq('user_id', userId),
      ]);
      if (requestId !== requestRef.current) return;
      if (accountsResult.error || daysResult.error || transactionsResult.error) throw new Error('load failed');
      const transactions = transactionsResult.data || [];
      setAccounts((accountsResult.data || []).map(mapAccount));
      setDays((daysResult.data || []).map(day => mapDay(day, transactions)));
    } catch {
      if (requestId === requestRef.current) setLoadError('No se pudieron cargar tus datos. Revisa tu conexión y recarga la página.');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) return undefined;
    const timerId = window.setTimeout(() => loadAll(session.user.id), 0);
    return () => window.clearTimeout(timerId);
  }, [session]);

  return { accounts, days, loading, loadError, setLoadError, loadAll };
}
