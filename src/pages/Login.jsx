import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { login } from '../services/auth';
import logo from '../assets/logo_extended.png';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Escuta as mudanças de login. Se o usuário estiver logado, redireciona para o painel correto.
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'Admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/collaborator', { replace: true });
      }
    }
  }, [currentUser, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      // O redirecionamento acontece automaticamente pelo useEffect acima assim que o Firebase confirmar o login
    } catch {
      setError("Credenciais inválidas. Verifique os dados e tente novamente.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Container Principal */}
      <div className="max-w-5xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row">
        
        {/* Lado Esquerdo - Branding (Preto e Vermelho) */}
        <div className="md:w-1/2 bg-zinc-950 p-12 text-white flex flex-col justify-between relative overflow-hidden">
          {/* Elemento de design no fundo */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-red-600 opacity-10 blur-3xl"></div>
          
          <div>
            <div className="flex items-center gap-3 mb-12">
              <div className="bg-black rounded-lg">
                <img src={logo} alt="HubDesk Logo" className="h-10 w-auto" />
              </div>
              <span className="text-xl font-bold tracking-wider">HUB<span className="text-red-500">DESK</span></span>
            </div>
            
            <h1 className="text-4xl font-bold mb-4 leading-tight">
              Gestão de <br />
              <span className="text-red-500">Métricas e Desempenho</span>
            </h1>
            <p className="text-zinc-400 text-lg max-w-sm">
              Acompanhe TMA, qualidade de atendimento e avaliações da equipe em uma plataforma centralizada e modular.
            </p>
          </div>

          <div className="mt-12 text-sm text-zinc-500">
            &copy; 2026 Sistema de Gestão Interna
          </div>
        </div>

        {/* Lado Direito - Formulário (Branco, Cinza e Preto) */}
        <div className="md:w-1/2 p-12 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Acesse sua conta</h2>
            <p className="text-gray-500 mb-8">Insira suas credenciais para gerenciar a equipe.</p>

            <form onSubmit={handleLogin} className="space-y-6">
              
              {/* Mensagem de Erro */}
              {error && (
                <div className="flex items-center gap-2 p-4 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {/* Input E-mail */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail corporativo</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-red-600 bg-gray-50 text-gray-900 transition-colors"
                    placeholder="voce@empresa.com"
                  />
                </div>
              </div>

              {/* Input Senha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-red-600 bg-gray-50 text-gray-900 transition-colors"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {/* Botão de Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600 font-medium transition-all disabled:opacity-70"
              >
                {isLoading ? 'Autenticando...' : 'Entrar no painel'}
                {!isLoading && <ArrowRight className="w-5 h-5" />}
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;