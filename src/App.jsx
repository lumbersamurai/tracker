import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, Pencil, Wallet, CreditCard, PiggyBank, Banknote, Landmark,
  X, Download, AlertTriangle, Calendar, StickyNote, ChevronDown, ChevronUp,
  Moon, LogOut, FileText, Sun,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './supabaseClient';

const ACCOUNT_TYPES = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote, color: '#7FD17F' },
  { id: 'debito', label: 'Cuenta de débito', icon: Wallet, color: '#6E9FD1' },
  { id: 'credito', label: 'Cuenta de crédito', icon: CreditCard, color: '#E3A66A' },
  { id: 'ahorro', label: 'Ahorro', icon: PiggyBank, color: '#9D7FE8' },
  { id: 'otro', label: 'Otro', icon: Landmark, color: 'var(--text-secondary)' },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatMXN(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateLabel(fecha) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

function typeMeta(typeId) {
  return ACCOUNT_TYPES.find(t => t.id === typeId) || ACCOUNT_TYPES[4];
}

function movementDelta(mov, accountType) {
  if (accountType === 'credito') {
    return mov.tipo === 'gasto' ? mov.monto : -mov.monto;
  }
  return mov.tipo === 'gasto' ? -mov.monto : mov.monto;
}

export default function App() {
  const [sesion, setSesion] = useState(null);
  const [checkingSesion, setCheckingSesion] = useState(true);

  const [accounts, setAccounts] = useState([]);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountForm, setAccountForm] = useState({ name: '', type: 'efectivo', initialBalance: '' });
  const [accountError, setAccountError] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  const [showDayModal, setShowDayModal] = useState(false);
  const [editingDayId, setEditingDayId] = useState(null);
  const [dayForm, setDayForm] = useState(null);
  const [dayError, setDayError] = useState('');
  const [savingDay, setSavingDay] = useState(false);

  const [expandedDay, setExpandedDay] = useState(null);

  const [pdfRange, setPdfRange] = useState({ start: '', end: '' });
  const [pdfError, setPdfError] = useState('');

  const [theme, setTheme] = useState(() => localStorage.getItem('tracker-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tracker-theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  }

  // Inyecta las variables de tema y el fondo neón directo en <head>,
  // así no depende de que index.css se haya reemplazado bien (evita choques con los estilos por defecto de Vite).
  useEffect(() => {
    const styleId = 'tracker-theme-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      :root {
        --bg-color: #F2F2F7;
        --card-bg: #FFFFFF;
        --card-border: #E5E5EA;
        --card-border-strong: #D1D1D6;
        --surface-2: #EDEDF2;
        --text-primary: #1C1C1E;
        --text-heading: #0B0B0D;
        --text-label: #3A3A3C;
        --text-secondary: #6B6B70;
        --text-muted: #9A9AA0;
        --text-muted-2: #8A8A90;
        --accent: #6E56CF;
        --neon-opacity: 0;
      }
      [data-theme='dark'] {
        --bg-color: #0B0914;
        --card-bg: #17151F;
        --card-border: #262433;
        --card-border-strong: #33313F;
        --surface-2: #1D1B27;
        --text-primary: #E8E9EB;
        --text-heading: #F5F5F7;
        --text-label: #D5D7DB;
        --text-secondary: #9499A3;
        --text-muted: #5A6068;
        --text-muted-2: #6E747D;
        --accent: #8A73F0;
        --neon-opacity: 1;
      }
      html, body { margin: 0; background-color: var(--bg-color) !important; transition: background-color 0.3s ease; }
      .neon-gradient {
        position: absolute !important;
        top: -120px; left: -50%; width: 200%; height: 520px;
        background:
          radial-gradient(circle at 30% 50%, rgba(0, 238, 255, 0.45), transparent 40%),
          radial-gradient(circle at 70% 40%, rgba(217, 70, 239, 0.55), transparent 50%),
          radial-gradient(circle at 50% 65%, rgba(110, 86, 207, 0.55), transparent 50%);
        filter: blur(70px);
        z-index: -1;
        opacity: var(--neon-opacity) !important;
        transition: opacity 0.4s ease;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // 1. Sesión de Supabase
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSesion(session);
      setCheckingSesion(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSesion(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // 2. Cargar datos cuando hay sesión
  useEffect(() => {
    if (sesion) loadAll(sesion.user.id);
  }, [sesion]);

  async function loadAll(userId) {
    setLoading(true);
    setLoadError('');
    const [cuentasRes, diasRes, transRes] = await Promise.all([
      supabase.from('cuentas').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('dias').select('*').eq('user_id', userId).order('fecha', { ascending: false }),
      supabase.from('transacciones').select('*').eq('user_id', userId),
    ]);

    if (cuentasRes.error || diasRes.error || transRes.error) {
      setLoadError('No se pudieron cargar tus datos. Revisa tu conexión y recarga la página.');
      setLoading(false);
      return;
    }

    setAccounts((cuentasRes.data || []).map(c => ({
      id: c.id,
      name: c.nombre,
      type: c.tipo,
      initialBalance: Number(c.saldo_inicial) || 0,
    })));

    setDays((diasRes.data || []).map(d => ({
      id: d.id,
      fecha: d.fecha,
      sinCambios: d.sin_cambios,
      nota: d.nota || '',
      movimientos: (transRes.data || [])
        .filter(t => t.dia_id === d.id)
        .map(t => ({ id: t.id, tipo: t.tipo, monto: Number(t.monto), cuentaId: t.cuenta_id, descripcion: t.descripcion || '' })),
    })));

    setLoading(false);
  }

  const balances = useMemo(() => {
    const map = {};
    accounts.forEach(acc => { map[acc.id] = acc.initialBalance; });
    days.forEach(day => {
      (day.movimientos || []).forEach(m => {
        const acc = accounts.find(a => a.id === m.cuentaId);
        if (!acc) return;
        map[acc.id] += movementDelta(m, acc.type);
      });
    });
    return map;
  }, [accounts, days]);

  const liquidTotal = accounts.filter(a => a.type !== 'credito').reduce((s, a) => s + (balances[a.id] || 0), 0);
  const creditDebt = accounts.filter(a => a.type === 'credito').reduce((s, a) => s + (balances[a.id] || 0), 0);
  const sortedDays = [...days].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  // ---------- Cuentas ----------
  function openNewAccount() {
    setEditingAccount(null);
    setAccountForm({ name: '', type: 'efectivo', initialBalance: '' });
    setAccountError('');
    setShowAccountModal(true);
  }

  function openEditAccount(acc) {
    setEditingAccount(acc.id);
    setAccountForm({ name: acc.name, type: acc.type, initialBalance: String(acc.initialBalance) });
    setAccountError('');
    setShowAccountModal(true);
  }

  async function saveAccount(e) {
    e.preventDefault();
    if (!accountForm.name.trim()) { setAccountError('Ponle un nombre a la cuenta, ej. "Efectivo 1"'); return; }
    const initial = accountForm.initialBalance === '' ? 0 : parseFloat(accountForm.initialBalance);
    if (isNaN(initial)) { setAccountError('El saldo inicial debe ser un número'); return; }

    setSavingAccount(true);
    setAccountError('');

    if (editingAccount) {
      const { error } = await supabase
        .from('cuentas')
        .update({ nombre: accountForm.name.trim(), tipo: accountForm.type, saldo_inicial: initial })
        .eq('id', editingAccount);
      if (error) { setAccountError('No se pudo guardar. Intenta de nuevo.'); setSavingAccount(false); return; }
    } else {
      const { error } = await supabase
        .from('cuentas')
        .insert([{ user_id: sesion.user.id, nombre: accountForm.name.trim(), tipo: accountForm.type, saldo_inicial: initial }]);
      if (error) { setAccountError('No se pudo crear la cuenta.'); setSavingAccount(false); return; }
    }

    setSavingAccount(false);
    setShowAccountModal(false);
    loadAll(sesion.user.id);
  }

  async function removeAccount(id) {
    const usedIn = days.some(d => (d.movimientos || []).some(m => m.cuentaId === id));
    if (usedIn && !window.confirm('Esta cuenta ya tiene movimientos registrados. Si la eliminas, esos movimientos se quedarán sin cuenta asociada. ¿Eliminar de todas formas?')) {
      return;
    }
    await supabase.from('cuentas').delete().eq('id', id);
    loadAll(sesion.user.id);
  }

  // ---------- Registro diario ----------
  function blankMovLine() {
    return { id: `tmp_${Date.now()}_${Math.random()}`, tipo: 'gasto', monto: '', cuentaId: accounts[0]?.id || '', descripcion: '' };
  }

  function openNewDay() {
    setEditingDayId(null);
    setDayForm({ fecha: todayStr(), sinCambios: false, nota: '', movimientos: [blankMovLine()] });
    setDayError('');
    setShowDayModal(true);
  }

  function openEditDay(day) {
    setEditingDayId(day.id);
    setDayForm({
      fecha: day.fecha,
      sinCambios: day.sinCambios,
      nota: day.nota || '',
      movimientos: day.sinCambios
        ? [blankMovLine()]
        : (day.movimientos || []).map(m => ({ ...m, monto: String(m.monto) })),
    });
    setDayError('');
    setShowDayModal(true);
  }

  function addMovLine() {
    setDayForm(f => ({ ...f, movimientos: [...f.movimientos, blankMovLine()] }));
  }

  function updateMovLine(id, patch) {
    setDayForm(f => ({ ...f, movimientos: f.movimientos.map(m => (m.id === id ? { ...m, ...patch } : m)) }));
  }

  function removeMovLine(id) {
    setDayForm(f => ({ ...f, movimientos: f.movimientos.filter(m => m.id !== id) }));
  }

  async function saveDay(e) {
    e.preventDefault();
    if (!dayForm.fecha) { setDayError('Elige una fecha'); return; }

    const duplicate = days.find(d => d.fecha === dayForm.fecha && d.id !== editingDayId);
    if (duplicate) { setDayError('Ya existe un registro para ese día. Ábrelo y edítalo en vez de crear otro.'); return; }

    let movimientos = [];
    if (!dayForm.sinCambios) {
      for (const m of dayForm.movimientos) {
        const monto = parseFloat(m.monto);
        if (!m.cuentaId) { setDayError('Cada movimiento necesita una cuenta'); return; }
        if (isNaN(monto) || monto <= 0) { setDayError('Revisa los montos: deben ser números mayores a 0'); return; }
        movimientos.push({ tipo: m.tipo, monto, cuentaId: m.cuentaId, descripcion: m.descripcion.trim() });
      }
      if (movimientos.length === 0) { setDayError('Agrega al menos un movimiento, o marca el día como "sin cambios"'); return; }
    }

    setSavingDay(true);
    setDayError('');

    const diaPayload = {
      user_id: sesion.user.id,
      fecha: dayForm.fecha,
      sin_cambios: dayForm.sinCambios,
      nota: dayForm.nota.trim(),
    };

    let diaId = editingDayId;
    if (editingDayId) {
      const { error } = await supabase.from('dias').update(diaPayload).eq('id', editingDayId);
      if (error) { setDayError('No se pudo guardar el día.'); setSavingDay(false); return; }
      await supabase.from('transacciones').delete().eq('dia_id', editingDayId);
    } else {
      const { data, error } = await supabase.from('dias').insert([diaPayload]).select().single();
      if (error) { setDayError('No se pudo guardar el día.'); setSavingDay(false); return; }
      diaId = data.id;
    }

    if (!dayForm.sinCambios && movimientos.length > 0) {
      const rows = movimientos.map(m => ({
        user_id: sesion.user.id,
        dia_id: diaId,
        cuenta_id: m.cuentaId,
        tipo: m.tipo,
        monto: m.monto,
        descripcion: m.descripcion,
      }));
      const { error } = await supabase.from('transacciones').insert(rows);
      if (error) { setDayError('El día se guardó, pero hubo un error al guardar los movimientos.'); setSavingDay(false); return; }
    }

    setSavingDay(false);
    setShowDayModal(false);
    loadAll(sesion.user.id);
  }

  async function removeDay(id) {
    if (!window.confirm('¿Eliminar este registro del día? Esto también borrará sus movimientos.')) return;
    await supabase.from('dias').delete().eq('id', id);
    loadAll(sesion.user.id);
  }

  function generateStatementPDF() {
    setPdfError('');
    if (!pdfRange.start || !pdfRange.end) { setPdfError('Selecciona una fecha inicial y una final'); return; }
    if (pdfRange.start > pdfRange.end) { setPdfError('La fecha inicial debe ser anterior a la final'); return; }

    // Iteramos día por día usando componentes locales (evita saltos de un día por zona horaria)
    const [sy, sm, sd] = pdfRange.start.split('-').map(Number);
    const [ey, em, ed] = pdfRange.end.split('-').map(Number);
    const cursor = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);

    const rows = [];
    let totalIngresos = 0;
    let totalGastos = 0;

    while (cursor <= endDate) {
      const fecha = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const dayRecord = days.find(d => d.fecha === fecha);

      if (!dayRecord || dayRecord.sinCambios || (dayRecord.movimientos || []).length === 0) {
        rows.push([
          fecha,
          dayRecord?.sinCambios ? 'Sin cambios' : 'Sin registro',
          '-',
          '-',
          dayRecord?.nota || '',
        ]);
      } else {
        dayRecord.movimientos.forEach((m, idx) => {
          const acc = accounts.find(a => a.id === m.cuentaId);
          rows.push([
            idx === 0 ? fecha : '',
            `${m.descripcion || (m.tipo === 'gasto' ? 'Gasto' : 'Ingreso')} (${acc ? acc.name : 'Cuenta eliminada'})`,
            m.tipo === 'ingreso' ? formatMXN(m.monto) : '-',
            m.tipo === 'gasto' ? formatMXN(m.monto) : '-',
            idx === 0 ? (dayRecord.nota || '') : '',
          ]);
          if (m.tipo === 'ingreso') totalIngresos += m.monto;
          else totalGastos += m.monto;
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Estado de cuenta: ${pdfRange.start} al ${pdfRange.end}`, 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generado el ${todayStr()} — ${sesion.user.email}`, 14, 21);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 27,
      head: [['Fecha', 'Concepto', 'Ingreso', 'Gasto', 'Nota del día']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [110, 86, 207] },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 4: { cellWidth: 45 } },
    });

    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 30;
    doc.setFontSize(11);
    doc.text(`Total ingresos: ${formatMXN(totalIngresos)}`, 14, finalY + 10);
    doc.text(`Total gastos: ${formatMXN(totalGastos)}`, 14, finalY + 17);
    doc.text(`Balance del periodo: ${formatMXN(totalIngresos - totalGastos)}`, 14, finalY + 24);

    doc.save(`Estado_Cuenta_${pdfRange.start}_al_${pdfRange.end}.pdf`);
  }

  function exportBackup() {
    const payload = { accounts, days, exportado: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo-finanzas-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Pantallas de carga / login ----------
  if (checkingSesion) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Cargando…</div>
      </div>
    );
  }

  if (!sesion) {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        <div className="neon-gradient" />
        <button
          onClick={toggleTheme}
          style={{ position: 'absolute', top: 20, right: 20, width: 40, height: 40, borderRadius: 20, border: '1px solid var(--card-border)', background: 'var(--card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
        >
          {theme === 'dark' ? <Sun size={16} color="var(--text-primary)" /> : <Moon size={16} color="var(--text-primary)" />}
        </button>
        <div style={{ fontSize: 13, letterSpacing: 1.5, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10, zIndex: 2 }}>
          Diario financiero
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 24px 0', color: 'var(--text-heading)', zIndex: 2 }}>Inicia sesión para continuar</h1>
        <button
          onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
          style={{ padding: '12px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer', zIndex: 2 }}
        >
          Iniciar sesión con Google
        </button>
      </div>
    );
  }

  if (loading && accounts.length === 0 && days.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Cargando tus datos…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', color: 'var(--text-primary)', fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 100, position: 'relative', overflow: 'hidden' }}>
      <div className="neon-gradient" />
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: inherit; }
        ::placeholder { color: var(--text-muted); }
        .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 14px; }
        button { cursor: pointer; }
        .mono { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
        .field { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid var(--card-border); background: var(--bg-color); color: var(--text-primary); font-size: 14px; margin-bottom: 10px; }
        @media (max-width: 640px) {
          .grid-accounts { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, letterSpacing: 1.5, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
              Diario financiero
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: 'var(--text-heading)' }}>Un registro por día</h1>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>{sesion.user.email}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              style={{ background: 'var(--surface-2)', border: '1px solid var(--card-border-strong)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={exportBackup}
              style={{ background: 'var(--surface-2)', border: '1px solid var(--card-border-strong)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12.5, whiteSpace: 'nowrap' }}
            >
              <Download size={14} /> Respaldo
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{ background: 'var(--surface-2)', border: '1px solid var(--card-border-strong)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12.5, whiteSpace: 'nowrap' }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>

        {loadError && (
          <div style={{ background: 'rgba(227,106,106,0.1)', border: '1px solid rgba(227,106,106,0.3)', borderRadius: 12, padding: 14, marginBottom: 16, display: 'flex', gap: 10 }}>
            <AlertTriangle size={18} color="#E36A6A" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: '#E8B5B5', lineHeight: 1.5 }}>{loadError}</div>
          </div>
        )}

        {/* Resumen */}
        {accounts.length > 0 && (
          <div className="card" style={{ padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Saldo líquido total (sin contar crédito)</div>
            <div className="mono" style={{ fontSize: 38, fontWeight: 700, color: liquidTotal >= 0 ? '#7FD17F' : '#E36A6A', letterSpacing: -1 }}>
              {formatMXN(liquidTotal)}
            </div>
            {creditDebt !== 0 && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#E3A66A' }}>
                Deuda de crédito pendiente: <b className="mono">{formatMXN(creditDebt)}</b>
              </div>
            )}
          </div>
        )}

        {/* Cuentas */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-label)' }}>Tus cuentas</span>
          <button
            onClick={openNewAccount}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: 4 }}
          >
            <Plus size={14} /> Agregar cuenta
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="card" style={{ padding: 24, marginBottom: 20, textAlign: 'center' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13.5, marginBottom: 12 }}>
              Aún no tienes cuentas. Crea las que uses: "Efectivo 1", "Débito BBVA", "Crédito Revolut", etc.
            </div>
            <button
              onClick={openNewAccount}
              style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13.5 }}
            >
              Crear mi primera cuenta
            </button>
          </div>
        ) : (
          <div className="grid-accounts" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {accounts.map(acc => {
              const meta = typeMeta(acc.type);
              const Icon = meta.icon;
              const bal = balances[acc.id] || 0;
              const isCredit = acc.type === 'credito';
              return (
                <div key={acc.id} className="card" style={{ padding: 14, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Icon size={14} color={meta.color} />
                    <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.2 }}>{acc.name}</span>
                  </div>
                  <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: isCredit && bal > 0 ? '#E3A66A' : 'var(--text-heading)' }}>
                    {formatMXN(bal)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted-2)', marginTop: 2 }}>
                    {meta.label}{isCredit ? (bal > 0 ? ' · a deber' : ' · al corriente') : ''}
                  </div>
                  <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4 }}>
                    <button onClick={() => openEditAccount(acc)} style={{ background: 'none', border: 'none', padding: 2 }}>
                      <Pencil size={12} color="var(--text-muted)" />
                    </button>
                    <button onClick={() => removeAccount(acc.id)} style={{ background: 'none', border: 'none', padding: 2 }}>
                      <Trash2 size={12} color="var(--text-muted)" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Estado de cuenta en PDF */}
        {accounts.length > 0 && (
          <div className="card" style={{ padding: 18, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <FileText size={14} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-label)' }}>Generar estado de cuenta</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="date"
                value={pdfRange.start}
                onChange={e => setPdfRange(r => ({ ...r, start: e.target.value }))}
                className="field"
                style={{ marginBottom: 0, flex: '1 1 140px' }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>a</span>
              <input
                type="date"
                value={pdfRange.end}
                onChange={e => setPdfRange(r => ({ ...r, end: e.target.value }))}
                className="field"
                style={{ marginBottom: 0, flex: '1 1 140px' }}
              />
              <button
                onClick={generateStatementPDF}
                style={{ padding: '11px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
              >
                <Download size={14} /> Descargar PDF
              </button>
            </div>
            {pdfError && <div style={{ color: '#E36A6A', fontSize: 12.5, marginTop: 8 }}>{pdfError}</div>}
          </div>
        )}

        {/* Línea de días */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-label)' }}>Registro diario</span>
        </div>

        {sortedDays.length === 0 && (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13.5 }}>
            Aún no hay días registrados. Cada día puedes anotar tus ingresos y gastos, o marcarlo como "sin cambios".
          </div>
        )}

        {sortedDays.map(day => {
          const isOpen = expandedDay === day.id;
          const totalIngresos = (day.movimientos || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
          const totalGastos = (day.movimientos || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0);
          return (
            <div key={day.id} className="card" style={{ padding: 16, marginBottom: 10 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpandedDay(isOpen ? null : day.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar size={14} color="var(--accent)" />
                  <span style={{ fontSize: 13.5, fontWeight: 600, textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                    {formatDateLabel(day.fecha)}
                  </span>
                  {day.sinCambios && (
                    <span style={{ fontSize: 10.5, background: 'rgba(148,153,163,0.15)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Moon size={10} /> sin cambios
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {!day.sinCambios && (
                    <div className="mono" style={{ fontSize: 12.5, display: 'flex', gap: 8 }}>
                      {totalIngresos > 0 && <span style={{ color: '#7FD17F' }}>+{formatMXN(totalIngresos)}</span>}
                      {totalGastos > 0 && <span style={{ color: '#E36A6A' }}>-{formatMXN(totalGastos)}</span>}
                    </div>
                  )}
                  {isOpen ? <ChevronUp size={16} color="var(--text-muted-2)" /> : <ChevronDown size={16} color="var(--text-muted-2)" />}
                </div>
              </div>

              {isOpen && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--card-border)' }}>
                  {!day.sinCambios && (day.movimientos || []).map(m => {
                    const acc = accounts.find(a => a.id === m.cuentaId);
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--surface-2)' }}>
                        <div>
                          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{m.descripcion || (m.tipo === 'gasto' ? 'Gasto' : 'Ingreso')}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted-2)' }}>{acc ? acc.name : 'Cuenta eliminada'}</div>
                        </div>
                        <span className="mono" style={{ fontSize: 13.5, fontWeight: 600, color: m.tipo === 'gasto' ? '#E36A6A' : '#7FD17F' }}>
                          {m.tipo === 'gasto' ? '-' : '+'}{formatMXN(m.monto)}
                        </span>
                      </div>
                    );
                  })}

                  {day.nota && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, background: 'var(--bg-color)', border: '1px solid var(--card-border)', borderRadius: 10, padding: 12 }}>
                      <StickyNote size={14} color="#9D7FE8" style={{ flexShrink: 0, marginTop: 1 }} />
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>{day.nota}</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <button
                      onClick={() => openEditDay(day)}
                      style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--card-border-strong)', background: 'var(--surface-2)', color: 'var(--text-label)', fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                    >
                      <Pencil size={12} /> Editar
                    </button>
                    <button
                      onClick={() => removeDay(day.id)}
                      style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid rgba(227,106,106,0.3)', background: 'rgba(227,106,106,0.08)', color: '#E36A6A', fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                    >
                      <Trash2 size={12} /> Eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Botón flotante */}
      <button
        onClick={openNewDay}
        disabled={accounts.length === 0}
        title={accounts.length === 0 ? 'Primero agrega una cuenta' : 'Registrar el día'}
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: '50%',
          background: accounts.length === 0 ? 'var(--card-border-strong)' : 'var(--accent)', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: accounts.length === 0 ? 'none' : '0 4px 20px rgba(110,86,207,0.5)', zIndex: 10,
        }}
      >
        <Plus size={26} color={accounts.length === 0 ? 'var(--text-muted)' : '#fff'} />
      </button>

      {/* Modal: cuenta */}
      {showAccountModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20 }} onClick={() => setShowAccountModal(false)}>
          <form onSubmit={saveAccount} onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', padding: 22, paddingBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{editingAccount ? 'Editar cuenta' : 'Nueva cuenta'}</span>
              <button type="button" onClick={() => setShowAccountModal(false)} style={{ background: 'none', border: 'none' }}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <input
              placeholder='Nombre, ej. "Efectivo 1" o "Débito BBVA"'
              value={accountForm.name}
              onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))}
              className="field"
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
              {ACCOUNT_TYPES.map(t => {
                const Icon = t.icon;
                const active = accountForm.type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAccountForm(f => ({ ...f, type: t.id }))}
                    style={{
                      padding: '10px 6px', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      border: active ? `1.5px solid ${t.color}` : '1px solid var(--card-border)',
                      background: active ? `${t.color}1F` : 'transparent',
                    }}
                  >
                    <Icon size={16} color={active ? t.color : 'var(--text-secondary)'} />
                    <span style={{ fontSize: 10.5, color: active ? t.color : 'var(--text-secondary)', textAlign: 'center' }}>{t.label}</span>
                  </button>
                );
              })}
            </div>

            <input
              placeholder="Saldo inicial (opcional, MXN)"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={accountForm.initialBalance}
              onChange={e => setAccountForm(f => ({ ...f, initialBalance: e.target.value }))}
              className="field"
              style={{ marginBottom: 14 }}
            />

            {accountError && <div style={{ color: '#E36A6A', fontSize: 12.5, marginBottom: 10 }}>{accountError}</div>}

            <button type="submit" disabled={savingAccount} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14.5, opacity: savingAccount ? 0.7 : 1 }}>
              {savingAccount ? 'Guardando…' : 'Guardar cuenta'}
            </button>
          </form>
        </div>
      )}

      {/* Modal: registro del día */}
      {showDayModal && dayForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20, overflowY: 'auto' }} onClick={() => setShowDayModal(false)}>
          <form onSubmit={saveDay} onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 520, borderRadius: '20px 20px 0 0', padding: 22, paddingBottom: 28, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{editingDayId ? 'Editar registro' : 'Registrar el día'}</span>
              <button type="button" onClick={() => setShowDayModal(false)} style={{ background: 'none', border: 'none' }}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <input
              type="date"
              value={dayForm.fecha}
              onChange={e => setDayForm(f => ({ ...f, fecha: e.target.value }))}
              className="field"
            />

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setDayForm(f => ({ ...f, sinCambios: false }))}
                style={{ flex: 1, padding: 10, borderRadius: 10, border: !dayForm.sinCambios ? '1.5px solid var(--accent)' : '1px solid var(--card-border)', background: !dayForm.sinCambios ? 'rgba(110,86,207,0.12)' : 'transparent', color: !dayForm.sinCambios ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 600, fontSize: 13 }}
              >
                Hubo movimientos
              </button>
              <button
                type="button"
                onClick={() => setDayForm(f => ({ ...f, sinCambios: true }))}
                style={{ flex: 1, padding: 10, borderRadius: 10, border: dayForm.sinCambios ? '1.5px solid var(--text-secondary)' : '1px solid var(--card-border)', background: dayForm.sinCambios ? 'rgba(148,153,163,0.12)' : 'transparent', color: dayForm.sinCambios ? 'var(--text-label)' : 'var(--text-secondary)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              >
                <Moon size={13} /> Sin cambios
              </button>
            </div>

            {!dayForm.sinCambios && (
              <div style={{ marginBottom: 14 }}>
                {dayForm.movimientos.map((m, idx) => (
                  <div key={m.id} className="card" style={{ padding: 12, marginBottom: 10, background: 'var(--bg-color)' }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <button type="button" onClick={() => updateMovLine(m.id, { tipo: 'gasto' })}
                        style={{ flex: 1, padding: 7, borderRadius: 8, border: m.tipo === 'gasto' ? '1.5px solid #E36A6A' : '1px solid var(--card-border)', background: m.tipo === 'gasto' ? 'rgba(227,106,106,0.12)' : 'transparent', color: m.tipo === 'gasto' ? '#E36A6A' : 'var(--text-secondary)', fontWeight: 600, fontSize: 12 }}>
                        Gasto
                      </button>
                      <button type="button" onClick={() => updateMovLine(m.id, { tipo: 'ingreso' })}
                        style={{ flex: 1, padding: 7, borderRadius: 8, border: m.tipo === 'ingreso' ? '1.5px solid #7FD17F' : '1px solid var(--card-border)', background: m.tipo === 'ingreso' ? 'rgba(127,209,127,0.12)' : 'transparent', color: m.tipo === 'ingreso' ? '#7FD17F' : 'var(--text-secondary)', fontWeight: 600, fontSize: 12 }}>
                        Ingreso
                      </button>
                      {dayForm.movimientos.length > 1 && (
                        <button type="button" onClick={() => removeMovLine(m.id)} style={{ padding: '0 8px', background: 'none', border: 'none' }}>
                          <Trash2 size={14} color="var(--text-muted)" />
                        </button>
                      )}
                    </div>
                    <input
                      placeholder="Descripción, ej. Café, sueldo, transporte…"
                      value={m.descripcion}
                      onChange={e => updateMovLine(m.id, { descripcion: e.target.value })}
                      className="field"
                      style={{ marginBottom: 8 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        placeholder="Monto MXN"
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={m.monto}
                        onChange={e => updateMovLine(m.id, { monto: e.target.value })}
                        className="field"
                        style={{ marginBottom: 0, flex: 1 }}
                      />
                      <select
                        value={m.cuentaId}
                        onChange={e => updateMovLine(m.id, { cuentaId: e.target.value })}
                        className="field"
                        style={{ marginBottom: 0, flex: 1 }}
                      >
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addMovLine}
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px dashed var(--card-border-strong)', background: 'transparent', color: 'var(--accent)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Plus size={14} /> Agregar otro movimiento
                </button>
              </div>
            )}

            <div style={{ marginBottom: 6, fontSize: 12.5, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <StickyNote size={13} /> ¿Por qué estas transacciones? (opcional)
            </div>
            <textarea
              placeholder="Ej. Compré despensa para la semana, me pagaron un trabajo extra, salí a cenar por cumpleaños…"
              value={dayForm.nota}
              onChange={e => setDayForm(f => ({ ...f, nota: e.target.value }))}
              className="field"
              style={{ minHeight: 70, resize: 'vertical', marginBottom: 14 }}
            />

            {dayError && <div style={{ color: '#E36A6A', fontSize: 12.5, marginBottom: 10 }}>{dayError}</div>}

            <button type="submit" disabled={savingDay} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14.5, opacity: savingDay ? 0.7 : 1 }}>
              {savingDay ? 'Guardando…' : 'Guardar registro'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}