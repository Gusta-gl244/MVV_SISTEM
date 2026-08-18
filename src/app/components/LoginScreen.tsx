import { useState } from 'react';
import inspec360Logo from '../../assets/brand/inspec360-color.png';
import grupoLogo from '../../assets/brand/grupo-mvv-bnmc.png';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { authenticate } from '../data/store';
import type { User } from '../App';
import { ShieldCheck } from 'lucide-react';
import { useVersionInfo, formatUpdateTime } from '@/hooks/useVersionInfo';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const versionInfo = useVersionInfo();

  const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const sysUser = await authenticate(email, password);
    if (sysUser) {
      onLogin({
        id: sysUser.id,
        name: sysUser.name,
        email: sysUser.email,
        role: sysUser.role,
        avatar: sysUser.avatar,
      });
    } else {
      setError('E-mail ou senha inválidos. Verifique suas credenciais.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative" style={{ backgroundColor: '#193A2A' }}>
      {/* Background pattern */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, #AA8933, #AA8933 1px, transparent 1px, transparent 40px)`,
        }}
      />

      {/* Vale Verde Badge - top of screen */}
      <div className="relative z-10 mb-4 flex items-center gap-2 px-4 py-2 rounded-full text-xs"
        style={{ backgroundColor: 'rgba(170,137,51,0.15)', border: '1px solid rgba(170,137,51,0.3)', color: '#AA8933' }}>
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Produto gerenciado pela <strong>Mineração Vale Verde</strong></span>
      </div>

      <div className="relative w-full max-w-sm px-6">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Top accent */}
          <div className="h-1.5" style={{ backgroundColor: '#AA8933' }} />

          <div className="p-8">
            {/* Logo */}
            <div className="flex items-center justify-center mb-6">
              <img src={inspec360Logo} alt="INSPEC360" className="h-28 w-auto object-contain" />
            </div>

            {/* Title */}
            <div className="text-center mb-6">
              <h1 style={{ color: '#193A2A' }} className="text-lg">Sistema de Inspeções</h1>
              <p className="text-xs text-gray-500 mt-1">LT 230kV – Gestão de Estruturas</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" style={{ color: '#193A2A' }} className="text-sm">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="border-gray-200 focus:border-[#AA8933]"
                  placeholder="seu@email.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" style={{ color: '#193A2A' }} className="text-sm">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="border-gray-200 focus:border-[#AA8933]"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="text-xs text-red-600 bg-red-50 rounded p-2 text-center">{error}</div>
              )}

              <Button
                type="submit"
                className="w-full text-white"
                style={{ backgroundColor: '#AA8933' }}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2 justify-center">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Entrando...
                  </span>
                ) : ('Entrar')}
              </Button>
            </form>

            {/* Contas de teste — só aparece em modo de desenvolvimento
                (VITE_DEV_MODE=true). Some sozinho na publicação real. */}
            {isDevMode && (
              <div className="mt-6 pt-5 border-t border-gray-100">
                <p className="text-xs text-amber-600 text-center mb-2 font-medium">⚠️ Modo de desenvolvimento — contas de teste:</p>
                <div className="space-y-1">
                  {[
                    { email: 'tecnico@inspec360.com', label: 'Técnico' },
                    { email: 'supervisor@inspec360.com', label: 'Supervisor' },
                    { email: 'admin@inspec360.com', label: 'Super Admin' },
                  ].map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => { setEmail(acc.email); setPassword('inspec360'); }}
                      className="w-full text-left text-xs px-3 py-1.5 rounded hover:bg-gray-50 transition-colors flex justify-between items-center"
                    >
                      <span className="text-gray-600">{acc.email}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#193A2A' }}>
                        {acc.label}
                      </span>
                    </button>
                  ))}
                  <p className="text-xs text-gray-400 text-center pt-1">Senha: inspec360</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom watermark */}
        <p className="text-center text-white/30 text-[10px] mt-4">
          © 2026 INSPEC360 · Mineração Vale Verde · v{versionInfo?.version || '2.2.0'}
        </p>

        {/* Last update info */}
        {versionInfo && (
          <p className="text-center text-white/40 text-[9px] mt-1.5">
            ⏱️ Última atualização: {formatUpdateTime(versionInfo.buildDate)}
          </p>
        )}

        {/* Grupo controlador */}
        <div className="flex justify-center mt-4">
          <img
            src={grupoLogo}
            alt="Mineração Vale Verde · BNMC"
            className="w-56 max-w-full h-auto drop-shadow-lg"
          />
        </div>
      </div>
    </div>
  );
}
