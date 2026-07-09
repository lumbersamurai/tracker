import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Wallet, CreditCard, PiggyBank, Banknote, X, Download, Upload, AlertTriangle, Copy, Check, Target, Heart } from 'lucide-react';
import { supabase } from './supabaseClient';

const ACCOUNTS = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote, color: '#5B8C5A' },
  { id: 'revolut_debito', label: 'Revolut Débito', icon: Wallet, color: '#6E56CF' },
  { id: 'bbva_debito', label: 'BBVA Débito', icon: Wallet, color: '#1B4F9C' },
  { id: 'santander_like', label: 'Santander Like U', icon: Wallet, color: '#EC0000' },
  { id: 'revolut_credito', label: 'Revolut Crédito', icon: CreditCard, color: '#101720' },
];

const CORTE_DAY = 5;
const PAGO_DAY = 8;
const STORAGE_KEY = 'finanzas-state-v2';

function formatMXN(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function getCortePeriod(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  let cierreMonth = d.getMonth();
  let cierreYear = d.getFullYear();
  if (day > CORTE_DAY) {
    cierreMonth += 1;
    if (cierreMonth > 11) { cierreMonth = 0; cierreYear += 1; }
  }
  const cierre = new Date(cierreYear, cierreMonth, CORTE_DAY);
  let pagoMonth = cierreMonth + 1;
  let pagoYear = cierreYear;
  if (pagoMonth > 11) { pagoMonth = 0; pagoYear += 1; }
  const pago = new Date(pagoYear, pagoMonth, PAGO_DAY);
  return {
    cierreLabel: cierre.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
    pagoLabel: pago.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
    key: `${cierreYear}-${String(cierreMonth + 1).padStart(2, '0')}`,
  };
}

const DEFAULT_STATE = {
  balances: {
    efectivo: 1018,
    revolut_debito: 1741.75,
    bbva_debito: 0,
    santander_like: 0,
    revolut_credito: 522.28,
  },
  emergencyFund: 2190,
  deptFund: 0,
  goals: [
    { id: 'goal1', desc: 'Reloj nuevo', target: 1500, saved: 0, term: 'mediano/largo plazo' },
    { id: 'goal2', desc: 'Fitbit Air', target: 1500, saved: 0, term: 'mediano/largo plazo' },
    { id: 'goal3', desc: 'Batería portátil delgada y ligera ✅', target: 390, saved: 390, term: 'mediano/largo plazo' },
    { id: 'goal5', desc: 'Apartado servicios departamento (predio, agua, luz)', target: 2000, saved: 0, term: 'mediano/largo plazo', monthlyTarget: 167, note: 'Apartar ~$167/mes del ingreso de renta para cubrir el pago anual de ~$2,000 dividido entre 3 personas' },
    { id: 'goal4', desc: 'Citas con la chica que me gusta (flores, regalos, salidas)', target: null, saved: 0, term: 'mensual recurrente', monthlyTarget: 800, note: 'Más si hay ocasión especial o ingreso extra' },
  ],
  movements: [], // Se llenará desde Supabase
};

export default function App() {
  const [sesion, setSesion] = useState(null);
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ desc: '', monto: '', cuenta: 'efectivo', tipo: 'gasto', fecha: todayStr() });
  const [formError, setFormError] = useState('');
  const textareaRef = useRef(null);

  // 1. Manejo de Sesión Supabase
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSesion(session));
    supabase.auth.onAuthStateChange((_event, session) => setSesion(session));
  }, []);

  // 2. Cargar datos combinados al iniciar sesión
  useEffect(() => {
    if (sesion) {
      cargarDatosBaseYLocales();
    }
  }, [sesion]);

  const cargarDatosBaseYLocales = async () => {
    // A. Cargar Metas y Balances locales
    let localState = DEFAULT_STATE;
    const res = localStorage.getItem(STORAGE_KEY);
    if (res) {
      localState = JSON.parse(res);
    }

    // B. Cargar Movimientos desde Supabase
    const { data, error } = await supabase
      .from('transacciones')
      .select('*')
      .order('fecha', { ascending: false });

    if (!error && data) {
      const movimientosDB = data.map(dbRow => ({
        id: dbRow.id,
        desc: dbRow.descripcion,
        monto: parseFloat(dbRow.monto),
        cuenta: dbRow.categoria,
        tipo: dbRow.tipo,
        fecha: dbRow.fecha.split('T')[0]
      }));
      localState.movements = movimientosDB;
    }

    setState(localState);
    setLoaded(true);
    sincronizarColaOffline();
  };

  const persist = (nextState) => {
    setState(nextState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  };

  // 3. Añadir Movimiento a Supabase y al Estado Local
  const addMovement = async (e) => {
    e.preventDefault();
    const monto = parseFloat(form.monto);
    if (!form.desc.trim()) { setFormError('Falta la descripción'); return; }
    if (isNaN(monto) || monto <= 0) { setFormError('Monto inválido'); return; }
    setFormError('');

    const dbRecord = {
      descripcion: form.desc.trim(),
      monto: monto,
      categoria: form.cuenta,
      tipo: form.tipo,
      fecha: form.fecha,
      user_id: sesion.user.id
    };

    if (navigator.onLine) {
      await supabase.from('transacciones').insert([dbRecord]);
      cargarDatosBaseYLocales(); // Recargar para obtener el ID real (UUID)
    } else {
      const cola = JSON.parse(localStorage.getItem('colaOffline') || '[]');
      cola.push(dbRecord);
      localStorage.setItem('colaOffline', JSON.stringify(cola));
      alert("Guardado localmente. Se sincronizará cuando haya conexión.");
    }

    // Actualizar balances locales inmediatamente
    const next = JSON.parse(JSON.stringify(state));
    if (form.cuenta === 'revolut_credito') {
      next.balances.revolut_credito += form.tipo === 'gasto' ? monto : -monto;
    } else {
      next.balances[form.cuenta] += form.tipo === 'gasto' ? -monto : monto;
    }

    persist(next);
    setForm({ desc: '', monto: '', cuenta: form.cuenta, tipo: 'gasto', fecha: todayStr() });
    setShowForm(false);
  };

  // 4. Eliminar Movimiento
  const removeMovement = async (id) => {
    const mov = state.movements.find(m => m.id === id);
    if (!mov) return;

    // Eliminar de Supabase
    if (navigator.onLine) {
      await supabase.from('transacciones').delete().eq('id', id);
    }

    const next = JSON.parse(JSON.stringify(state));
    next.movements = next.movements.filter(m => m.id !== id);
    if (mov.cuenta === 'revolut_credito') {
      next.balances.revolut_credito -= mov.tipo === 'gasto' ? mov.monto : -mov.monto;
    } else {
      next.balances[mov.cuenta] -= mov.tipo === 'gasto' ? -mov.monto : mov.monto;
    }
    persist(next);
  };

  // 5. Sincronizar cola offline
  const sincronizarColaOffline = async () => {
    const cola = JSON.parse(localStorage.getItem('colaOffline') || '[]');
    if (cola.length > 0 && navigator.onLine) {
      const { error } = await supabase.from('transacciones').insert(cola);
      if (!error) {
        localStorage.removeItem('colaOffline');
        cargarDatosBaseYLocales();
      }
    }
  };

  const handleExport = () => {
    const json = JSON.stringify(state);
    return btoa(unescape(encodeURIComponent(json)));
  };

  const copyExport = async () => {
    const code = handleExport();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else if (textareaRef.current) {
        textareaRef.current.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e) {
      if (textareaRef.current) textareaRef.current.select();
    }
  };

  const handleImport = () => {
    try {
      const decoded = decodeURIComponent(escape(atob(importText.trim())));
      const parsed = JSON.parse(decoded);
      if (!parsed.balances || !parsed.movements) throw new Error('formato inválido');
      persist(parsed);
      setImportText('');
      setImportError('');
      setShowSync(false);
    } catch (e) {
      setImportError('Código inválido.');
    }
  };

  // PANTALLA DE LOGIN REQUERIDA POR SUPABASE
  if (!sesion) {
    return (
      <div style={{ minHeight: '100vh', background: '#0F1115', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 24px 0', color: '#F5F5F7' }}>Tracker Financiero</h1>
        <button
          onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
          style={{ padding: '12px 24px', background: '#6E56CF', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
        >
          Iniciar Sesión con Google
        </button>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div style={{ minHeight: '100vh', background: '#0F1115', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        <div style={{ color: '#8A9099' }}>Cargando datos seguros...</div>
      </div>
    );
  }

  // CÁLCULOS DE UI
  const liquidTotal = state.balances.efectivo + state.balances.revolut_debito + state.balances.bbva_debito + state.balances.santander_like;
  const disponibleLibre = liquidTotal - state.emergencyFund - state.balances.revolut_credito - state.deptFund;

  const creditMovements = state.movements.filter(m => m.cuenta === 'revolut_credito');
  const periodMap = {};
  creditMovements.forEach(m => {
    const period = getCortePeriod(m.fecha);
    if (!periodMap[period.key]) periodMap[period.key] = { ...period, total: 0, items: [] };
    periodMap[period.key].total += m.tipo === 'gasto' ? m.monto : -m.monto;
    periodMap[period.key].items.push(m);
  });
  const periods = Object.values(periodMap).sort((a, b) => a.key.localeCompare(b.key));
  const sortedMovements = [...state.movements].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  return (
    <div style={{ minHeight: '100vh', background: '#0F1115', color: '#E8E9EB', fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 100 }}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea { font-family: inherit; }
        ::placeholder { color: #5A6068; }
        .card { background: #171A20; border: 1px solid #232730; border-radius: 14px; }
        button { cursor: pointer; }
        @media (max-width: 640px) { .grid-accounts { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 13, letterSpacing: 1.5, color: '#6E56CF', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
              Tracker financiero
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#F5F5F7' }}>Tus finanzas, día a día</h1>
          </div>
          <button onClick={() => setShowSync(true)} style={{ background: '#1D2128', border: '1px solid #2A2F38', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, color: '#9499A3', fontSize: 12.5 }}>
            <Upload size={14} /> Respaldo Total
          </button>
        </div>

        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#9499A3', marginBottom: 4 }}>Libre para gastar (descontando fondo de emergencia y deuda de crédito)</div>
          <div style={{ fontSize: 40, fontWeight: 700, color: disponibleLibre >= 0 ? '#7FD17F' : '#E36A6A', letterSpacing: -1 }}>
            {formatMXN(disponibleLibre)}
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: '#6E747D' }}>Líquido total</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{formatMXN(liquidTotal)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6E747D', display: 'flex', alignItems: 'center', gap: 4 }}>
                <PiggyBank size={13} /> Fondo emergencia
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#E36A6A' }}>−{formatMXN(state.emergencyFund)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6E747D', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CreditCard size={13} /> Deuda comprometida
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#E36A6A' }}>−{formatMXN(state.balances.revolut_credito)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6E747D', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Wallet size={13} /> Apartado depto (~$167/mes)
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#E36A6A' }}>−{formatMXN(state.deptFund)}</div>
            </div>
          </div>
        </div>

        <div className="grid-accounts" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          {ACCOUNTS.map(acc => {
            const Icon = acc.icon;
            const bal = state.balances[acc.id];
            const isCredit = acc.id === 'revolut_credito';
            return (
              <div key={acc.id} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Icon size={14} color={acc.color} />
                  <span style={{ fontSize: 11.5, color: '#9499A3', lineHeight: 1.2 }}>{acc.label}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: isCredit && bal > 0 ? '#E3A66A' : '#F5F5F7' }}>
                  {formatMXN(bal)}
                </div>
                {isCredit && <div style={{ fontSize: 10, color: '#6E747D', marginTop: 2 }}>{bal > 0 ? 'a deber' : 'al corriente'}</div>}
              </div>
            );
          })}
        </div>

        {periods.length > 0 && (
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#E3A66A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CreditCard size={14} /> Próximos pagos Revolut Crédito
            </div>
            {periods.map(p => (
              <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #232730' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#D5D7DB' }}>Corte: {p.cierreLabel}</div>
                  <div style={{ fontSize: 11.5, color: '#6E747D' }}>Se paga: {p.pagoLabel}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#E3A66A' }}>{formatMXN(p.total)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#9D7FE8', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Target size={14} /> Metas de ahorro
          </div>
          {state.goals.filter(g => g.term !== 'mensual recurrente').map(g => {
            const pct = g.target ? Math.min(100, (g.saved / g.target) * 100) : 0;
            return (
              <div key={g.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#E8E9EB' }}>{g.desc}</span>
                  <span style={{ fontSize: 12, color: '#9499A3' }}>{formatMXN(g.saved)} / {formatMXN(g.target)}</span>
                </div>
                <div style={{ height: 7, background: '#1D2128', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#7FD17F' : '#6E56CF', borderRadius: 6, transition: 'width 0.4s' }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#D5D7DB' }}>Movimientos sincronizados</span>
          </div>
          {sortedMovements.length === 0 && (
            <div style={{ color: '#5A6068', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              Aún no hay movimientos en la base de datos.
            </div>
          )}
          {sortedMovements.map(m => {
            const acc = ACCOUNTS.find(a => a.id === m.cuenta);
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1D2128' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13.5, color: '#E8E9EB' }}>{m.desc}</span>
                  <span style={{ fontSize: 11, color: '#6E747D' }}>{acc?.label} · {new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: m.tipo === 'gasto' ? '#E36A6A' : '#7FD17F' }}>
                    {m.tipo === 'gasto' ? '-' : '+'}{formatMXN(m.monto)}
                  </span>
                  <button onClick={() => removeMovement(m.id)} style={{ background: 'none', border: 'none', padding: 4 }}>
                    <Trash2 size={14} color="#5A6068" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button onClick={() => { setShowForm(true); setFormError(''); }} style={{ position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: '50%', background: '#6E56CF', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(110,86,207,0.5)', zIndex: 10 }}>
        <Plus size={26} color="#fff" />
      </button>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20 }} onClick={() => setShowForm(false)}>
          <form onSubmit={addMovement} onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', padding: 22, paddingBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Nuevo movimiento seguro</span>
              <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none' }}><X size={20} color="#9499A3" /></button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button type="button" onClick={() => setForm(f => ({ ...f, tipo: 'gasto' }))} style={{ flex: 1, padding: 10, borderRadius: 10, border: form.tipo === 'gasto' ? '1.5px solid #E36A6A' : '1px solid #232730', background: form.tipo === 'gasto' ? 'rgba(227,106,106,0.12)' : 'transparent', color: form.tipo === 'gasto' ? '#E36A6A' : '#9499A3', fontWeight: 600, fontSize: 13 }}>Gasto</button>
              <button type="button" onClick={() => setForm(f => ({ ...f, tipo: 'ingreso' }))} style={{ flex: 1, padding: 10, borderRadius: 10, border: form.tipo === 'ingreso' ? '1.5px solid #7FD17F' : '1px solid #232730', background: form.tipo === 'ingreso' ? 'rgba(127,209,127,0.12)' : 'transparent', color: form.tipo === 'ingreso' ? '#7FD17F' : '#9499A3', fontWeight: 600, fontSize: 13 }}>Ingreso / Pago</button>
            </div>
            <input placeholder="Descripción (ej. Café, recarga, cena…)" value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #232730', background: '#0F1115', color: '#E8E9EB', fontSize: 14, marginBottom: 10 }} />
            <input placeholder="Monto MXN" type="number" step="0.01" inputMode="decimal" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #232730', background: '#0F1115', color: '#E8E9EB', fontSize: 14, marginBottom: 10 }} />
            <select value={form.cuenta} onChange={e => setForm(f => ({ ...f, cuenta: e.target.value }))} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #232730', background: '#0F1115', color: '#E8E9EB', fontSize: 14, marginBottom: 10 }}>
              {ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #232730', background: '#0F1115', color: '#E8E9EB', fontSize: 14, marginBottom: 14 }} />
            {formError && <div style={{ color: '#E36A6A', fontSize: 12.5, marginBottom: 10 }}>{formError}</div>}
            <button type="submit" style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: '#6E56CF', color: '#fff', fontWeight: 700, fontSize: 14.5 }}>Guardar en la Nube</button>
          </form>
        </div>
      )}

      {showSync && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, padding: 16 }} onClick={() => setShowSync(false)}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 480, padding: 22, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Respaldo de Metas y Balances</span>
              <button onClick={() => setShowSync(false)} style={{ background: 'none', border: 'none' }}><X size={20} color="#9499A3" /></button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#7FD17F', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Download size={13} /> Exportar configuración</div>
              <textarea ref={textareaRef} readOnly value={handleExport()} style={{ width: '100%', height: 80, padding: 10, borderRadius: 8, border: '1px solid #232730', background: '#0F1115', color: '#9499A3', fontSize: 10.5, fontFamily: 'monospace', resize: 'none', marginBottom: 8 }} />
              <button onClick={copyExport} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #2A2F38', background: copied ? 'rgba(127,209,127,0.15)' : '#1D2128', color: copied ? '#7FD17F' : '#D5D7DB', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar código'}
              </button>
            </div>
            <div style={{ borderTop: '1px solid #232730', paddingTop: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#E3A66A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Upload size={13} /> Importar configuración</div>
              <textarea placeholder="Pega aquí el código copiado..." value={importText} onChange={e => setImportText(e.target.value)} style={{ width: '100%', height: 80, padding: 10, borderRadius: 8, border: '1px solid #232730', background: '#0F1115', color: '#E8E9EB', fontSize: 11, fontFamily: 'monospace', resize: 'none', marginBottom: 8 }} />
              {importError && <div style={{ color: '#E36A6A', fontSize: 12, marginBottom: 8 }}>{importError}</div>}
              <button onClick={handleImport} disabled={!importText.trim()} style={{ width: '100%', padding: 10, borderRadius: 8, border: 'none', background: importText.trim() ? '#6E56CF' : '#2A2F38', color: importText.trim() ? '#fff' : '#5A6068', fontSize: 13, fontWeight: 600 }}>Importar datos locales</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}