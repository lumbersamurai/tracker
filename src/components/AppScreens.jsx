import { Moon, Sun } from 'lucide-react';

export function LoadingScreen({ message }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}><div style={{ color: 'var(--text-secondary)' }}>{message}</div></div>;
}

export function LoginScreen({ theme, onToggleTheme, onLogin }) {
  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <button onClick={onToggleTheme} aria-label="Cambiar tema" style={{ position: 'absolute', top: 20, right: 20, width: 40, height: 40, borderRadius: 20, border: '1px solid var(--card-border)', background: 'var(--card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {theme === 'dark' ? <Sun size={16} color="var(--text-primary)" /> : <Moon size={16} color="var(--text-primary)" />}
      </button>
      <div style={{ fontSize: 13, letterSpacing: 1.5, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>Diario financiero</div>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 24px', color: 'var(--text-heading)' }}>Inicia sesión para continuar</h1>
      <button onClick={onLogin} style={{ padding: '12px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Iniciar sesión con Google</button>
    </div>
  );
}
