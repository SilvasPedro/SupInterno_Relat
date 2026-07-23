import React, { useState, useEffect, useMemo } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { 
    Users, UserPlus, Edit, FileText, MessageSquare, 
    X, Loader2, Calendar, Phone, PhoneMissed, 
    CheckCircle, Clock, Filter, KeyRound, UserX, UserCheck, Search 
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, where, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { registerCollaborator, updateCollaboratorProfile, registerFeedback } from '../services/adminAuth';
import { useNotification } from '../context/NotificationContext';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// --- FUNÇÕES AUXILIARES ---
const parseDateObj = (dateStr) => {
    if (!dateStr || dateStr === 'Semana Atual' || dateStr === 'Sem data') return 0;
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
    }
    if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    }
    return 0;
};

const timeToDecimal = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    return (hours * 60) + minutes + (seconds / 60);
};

const formatTime = (decimalMinutes) => {
    if (!decimalMinutes && decimalMinutes !== 0) return "00:00:00";
    const totalSeconds = Math.round(decimalMinutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const calcularPontuacao = (metrics) => {
    if (!metrics) return 0;
    // Pega tanto as chaves formatadas no relatório quanto as diretas do BD
    const ptsFinalizados = (Number(metrics.finalizados) || Number(metrics.Atendimentos_Finalizados) || 0) * 1;
    const ptsLigacoes = (Number(metrics.ligAtendidas) || Number(metrics.Ligacoes_Atendidas) || 0) * 2;
    const ptsHuggy = (Number(metrics.huggyVol) || Number(metrics.Atendimentos_Huggy) || 0) * 1;
    const ptsPerdidas = (Number(metrics.ligPerdidas) || Number(metrics.Ligacoes_Perdidas) || 0) * -5;
    
    return ptsFinalizados + ptsLigacoes + ptsHuggy + ptsPerdidas;
};

const CollaboratorsHub = () => {
    const { showToast } = useNotification();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingColab, setEditingColab] = useState(null);
    const [feedbackColab, setFeedbackColab] = useState(null);
    const [reportColab, setReportColab] = useState(null); 
    const [collaborators, setCollaborators] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- ESTADOS DE PESQUISA E FILTRO ---
    const [searchTerm, setSearchTerm] = useState('');
    const [showInactives, setShowInactives] = useState(false);
    const [shiftFilter, setShiftFilter] = useState('');
    const [evaluations, setEvaluations] = useState([]);

    // --- CONEXÃO EM TEMPO REAL ---
    useEffect(() => {
        const q = query(collection(db, "collaborators"), orderBy("name", "asc"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const docs = [];
            querySnapshot.forEach((doc) => {
                docs.push({ id: doc.id, ...doc.data() });
            });
            setCollaborators(docs);
            setLoading(false);
        }, (error) => {
            showToast("Erro ao carregar colaboradores: " + error.message, "error");
            setLoading(false);
        });

        const qEvals = query(collection(db, "weekly_evaluations"));
        const unsubEvals = onSnapshot(qEvals, (snapshot) => {
            const evals = [];
            snapshot.forEach((doc) => {
                evals.push({ id: doc.id, ...doc.data() });
            });
            setEvaluations(evals);
        });

        return () => {
            unsubscribe();
            unsubEvals();
        };
    }, [showToast]);

    // --- FUNÇÃO DE INATIVAÇÃO ---
    const handleToggleActive = async (colab) => {
        try {
            const newStatus = colab.active === false ? true : false;
            await updateDoc(doc(db, "collaborators", colab.id), { active: newStatus });
            showToast(`Colaborador ${newStatus ? 'ativado' : 'inativado'} com sucesso!`, "success");
        } catch (error) {
            showToast("Erro ao alterar status: " + error.message, "error");
        }
    };

    // --- LÓGICA DO GRÁFICO DE TURNOS (APENAS ATIVOS) ---
    const activeColabs = collaborators.filter(c => c.active !== false);
    const total = activeColabs.length;
    const manha = activeColabs.filter(c => c.shift === 'Manhã').length;
    const tarde = activeColabs.filter(c => c.shift === 'Tarde').length;
    const noite = activeColabs.filter(c => c.shift === 'Noite').length;
    const getPercent = (value) => total > 0 ? (value / total) * 100 : 0;

    // --- LÓGICA DE FILTRAGEM ---
    const filteredCollaborators = useMemo(() => {
        return collaborators.filter(colab => {
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = (colab.name && colab.name.toLowerCase().includes(searchLower)) || 
                                  (colab.shift && colab.shift.toLowerCase().includes(searchLower)) ||
                                  (colab.role && colab.role.toLowerCase().includes(searchLower));
            
            const matchesActive = showInactives ? true : colab.active !== false;
            const matchesShift = shiftFilter ? colab.shift === shiftFilter : true;
            
            return matchesSearch && matchesActive && matchesShift;
        });
    }, [collaborators, searchTerm, showInactives, shiftFilter]);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex-1 p-6 bg-gray-50 h-full overflow-y-auto">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Hub de Colaboradores</h1>
                    <p className="text-sm text-gray-500">Total de {total} colaboradores <strong>ativos</strong> na equipe.</p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                >
                    <UserPlus className="w-5 h-5" />
                    Novo Colaborador
                </button>
            </header>

            {/* Gráfico de Distribuição por Turno */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Distribuição da Equipe Ativa</h2>
                <div className="flex items-center gap-4 mb-3">
                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden flex">
                        <div style={{ width: `${getPercent(manha)}%` }} className="bg-amber-400 transition-all duration-700"></div>
                        <div style={{ width: `${getPercent(tarde)}%` }} className="bg-orange-500 transition-all duration-700"></div>
                        <div style={{ width: `${getPercent(noite)}%` }} className="bg-zinc-900 transition-all duration-700"></div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-6 text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                        <span className="font-medium text-gray-700">Manhã: {manha} ({getPercent(manha).toFixed(0)}%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                        <span className="font-medium text-gray-700">Tarde: {tarde} ({getPercent(tarde).toFixed(0)}%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-zinc-900"></div>
                        <span className="font-medium text-gray-700">Noite: {noite} ({getPercent(noite).toFixed(0)}%)</span>
                    </div>
                </div>
            </div>

            {/* Barra de Pesquisa e Filtros */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex w-full md:w-auto items-center gap-4 flex-wrap flex-1">
                    <div className="relative w-full md:w-96">
                        <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                        <input
                            type="text"
                            placeholder="Pesquisar por nome, cargo ou turno..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-600 transition-shadow text-sm"
                        />
                    </div>
                    <select 
                        value={shiftFilter} 
                        onChange={e => setShiftFilter(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-600 text-sm bg-white min-w-[120px]"
                    >
                        <option value="">Todos os Turnos</option>
                        <option value="Manhã">Manhã</option>
                        <option value="Tarde">Tarde</option>
                        <option value="Noite">Noite</option>
                    </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 shrink-0">
                    <input
                        type="checkbox"
                        checked={showInactives}
                        onChange={(e) => setShowInactives(e.target.checked)}
                        className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500 cursor-pointer"
                    />
                    Mostrar inativos
                </label>
            </div>

            {/* Grid de Cards dos Colaboradores */}
            {filteredCollaborators.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-gray-200">
                    <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-700">Nenhum colaborador encontrado</h3>
                    <p className="text-gray-500">Tente ajustar a sua pesquisa ou filtros.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredCollaborators.map((colab) => {
                        // Achar a última avaliação deste colaborador
                        const colabEvals = evaluations.filter(e => e.colabId === colab.id);
                        colabEvals.sort((a, b) => {
                            const timeA = a.date !== 'Semana Atual' ? parseDateObj(a.date) : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
                            const timeB = b.date !== 'Semana Atual' ? parseDateObj(b.date) : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
                            return timeA - timeB; 
                        });
                        const latestEval = colabEvals.length > 0 ? colabEvals[colabEvals.length - 1] : null;

                        return (
                            <CollaboratorCard
                                key={colab.id}
                                colab={colab}
                                latestEval={latestEval}
                                onEdit={() => setEditingColab(colab)}
                                onFeedback={() => setFeedbackColab(colab)}
                                onReport={() => setReportColab(colab)}
                                onToggleActive={() => handleToggleActive(colab)}
                            />
                        );
                    })}
                </div>
            )}

            {isCreateModalOpen && <CreateCollaboratorModal onClose={() => setIsCreateModalOpen(false)} onSuccess={() => setIsCreateModalOpen(false)} />}
            {editingColab && <EditCollaboratorModal colab={editingColab} onClose={() => setEditingColab(null)} />}
            {feedbackColab && <FeedbackModal colab={feedbackColab} onClose={() => setFeedbackColab(null)} />}
            {reportColab && <ReportDashboardModal colab={reportColab} onClose={() => setReportColab(null)} />}
        </div>
    );
};

// --- COMPONENTE DO CARD ---
const CollaboratorCard = ({ colab, latestEval, onEdit, onFeedback, onReport, onToggleActive }) => {
    const score = latestEval ? calcularPontuacao(latestEval) : null;
    
    return (
        <div className={`bg-white rounded-xl border ${colab.active === false ? 'border-gray-200 opacity-60' : 'border-gray-200'} shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md hover:border-red-200`}>
            <div className="p-5 border-b border-gray-100 flex items-start gap-4">
                <div className={`w-12 h-12 rounded-full ${colab.active === false ? 'bg-gray-400' : 'bg-zinc-950'} text-white flex items-center justify-center font-bold text-lg flex-shrink-0`}>
                    {colab.name?.charAt(0)}
                </div>
                <div className="overflow-hidden flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900 truncate" title={colab.name}>{colab.name}</h3>
                        {colab.active === false && <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 uppercase">Inativo</span>}
                    </div>
                    <p className="text-xs text-gray-500 mb-2 truncate" title={colab.email}>{colab.email}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${colab.shift === 'Manhã' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                        colab.shift === 'Tarde' ? 'bg-orange-50 text-orange-700 border border-orange-100' :
                            'bg-zinc-100 text-zinc-700 border border-zinc-200'
                        }`}>
                        {colab.shift}
                    </span>
                </div>
            </div>

            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 font-medium flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        Última avaliação:
                    </span>
                    <span className="font-bold text-gray-900">
                        {latestEval ? (latestEval.date || 'Sem data') : 'Nenhuma'}
                    </span>
                </div>
                {latestEval && (
                    <div className="flex justify-between items-center text-xs mt-2">
                        <span className="text-gray-500 font-medium">Pontuação:</span>
                        <span className={`font-black ${score < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {score} pts
                        </span>
                    </div>
                )}
            </div>

            <div className="p-2 bg-gray-50 grid grid-cols-4 gap-1">
                <button onClick={onEdit} className="flex flex-col items-center gap-1 p-2 text-zinc-500 hover:text-zinc-950 hover:bg-white rounded-lg transition-all">
                    <Edit className="w-4 h-4" />
                    <span className="text-[9px] font-bold uppercase">Editar</span>
                </button>
                <button onClick={onReport} className="flex flex-col items-center gap-1 p-2 text-red-600 hover:bg-white rounded-lg transition-all">
                    <FileText className="w-4 h-4" />
                    <span className="text-[9px] font-bold uppercase">Relatório</span>
                </button>
                <button onClick={onFeedback} className="flex flex-col items-center gap-1 p-2 text-red-600 hover:bg-white rounded-lg transition-all">
                    <MessageSquare className="w-4 h-4" />
                    <span className="text-[9px] font-bold uppercase">Feedback</span>
                </button>
                <button onClick={onToggleActive} className={`flex flex-col items-center gap-1 p-2 ${colab.active === false ? 'text-emerald-600' : 'text-red-600'} hover:bg-white rounded-lg transition-all`}>
                    {colab.active === false ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                    <span className="text-[9px] font-bold uppercase">{colab.active === false ? 'Ativar' : 'Inativar'}</span>
                </button>
            </div>
        </div>
    );
};

// --- COMPONENTE DO MODAL DE EDIÇÃO ---
const EditCollaboratorModal = ({ colab, onClose }) => {
    const { showToast } = useNotification();
    const [formData, setFormData] = useState({
        name: colab.name,
        role: colab.role,
        shift: colab.shift
    });
    const [loading, setLoading] = useState(false);
    const [resetting, setResetting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await updateCollaboratorProfile(colab.id, formData);
            showToast("Dados do colaborador atualizados com sucesso!", "success");
            onClose();
        } catch (error) {
            showToast("Erro ao atualizar: " + error.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!window.confirm(`Tem certeza que deseja enviar um e-mail de redefinição de senha para ${colab.email}?`)) return;
        
        setResetting(true);
        try {
            await sendPasswordResetEmail(auth, colab.email);
            showToast("E-mail de redefinição enviado com sucesso!", "success");
        } catch (error) {
            console.error(error);
            showToast("Erro ao enviar e-mail: " + error.message, "error");
        } finally {
            setResetting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-zinc-950/50 flex items-center justify-center p-4 z-[60] backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-5 bg-zinc-950 flex justify-between items-center text-white">
                    <h2 className="text-lg font-bold">Editar Perfil</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                        <input type="text" required value={formData.name} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                            onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">E-mail (Apenas Leitura)</label>
                        <input type="email" disabled value={colab.email} className="w-full p-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg outline-none cursor-not-allowed" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                            <input type="text" required value={formData.role} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                                onChange={e => setFormData({ ...formData, role: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Turno</label>
                            <select value={formData.shift} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none" onChange={e => setFormData({ ...formData, shift: e.target.value })}>
                                <option value="Manhã">Manhã</option>
                                <option value="Tarde">Tarde</option>
                                <option value="Noite">Noite</option>
                            </select>
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={onClose} className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
                        <button type="submit" disabled={loading} className="flex-1 py-2 px-4 bg-zinc-900 text-white rounded-lg hover:bg-black transition-colors disabled:opacity-50">
                            {loading ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>

                <div className="p-6 bg-red-50 border-t border-red-100 flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-bold text-red-800">Acesso</h4>
                        <p className="text-xs text-red-600">Restaurar senha do usuário.</p>
                    </div>
                    <button 
                        type="button" 
                        onClick={handleResetPassword}
                        disabled={resetting}
                        className="px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-colors text-xs font-bold flex items-center gap-2 shadow-sm"
                    >
                        {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                        Resetar Senha
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE DO MODAL DE CRIAÇÃO ---
const CreateCollaboratorModal = ({ onClose, onSuccess }) => {
    const { showToast } = useNotification();
    const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'Analista de Suporte', shift: 'Manhã', active: true });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await registerCollaborator(formData.name, formData.email, formData.password, formData.role, formData.shift);
            showToast("Colaborador cadastrado com sucesso!", "success");
            onSuccess();
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-zinc-950/50 flex items-center justify-center p-4 z-[60] backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-5 bg-zinc-950 flex justify-between items-center text-white">
                    <h2 className="text-lg font-bold">Cadastrar Novo Colaborador</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                        <input type="text" required className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                            onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">E-mail (Login)</label>
                        <input type="email" required className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                            onChange={e => setFormData({ ...formData, email: e.target.value })} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Senha Provisória</label>
                        <input type="password" required minLength="6" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                            onChange={e => setFormData({ ...formData, password: e.target.value })} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                            <input type="text" required defaultValue="Analista de Suporte" className="w-full p-2 border border-gray-300 rounded-lg outline-none"
                                onChange={e => setFormData({ ...formData, role: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Turno</label>
                            <select className="w-full p-2 border border-gray-300 rounded-lg outline-none" onChange={e => setFormData({ ...formData, shift: e.target.value })}>
                                <option value="Manhã">Manhã</option>
                                <option value="Tarde">Tarde</option>
                                <option value="Noite">Noite</option>
                            </select>
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={onClose} className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
                        <button type="submit" disabled={loading} className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
                            {loading ? 'Cadastrando...' : 'Salvar Cadastro'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- COMPONENTE DO MODAL DE FEEDBACK ---
const FeedbackModal = ({ colab, onClose }) => {
    const { showToast } = useNotification();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        type: 'Elogio',
        method: 'Presencial',
        protocol: '',
        comment: ''
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await registerFeedback(colab.id, formData);
            showToast("Feedback registrado com sucesso!", "success");
            onClose();
        } catch (error) {
            showToast("Erro ao registrar feedback: " + error.message, "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-zinc-950/50 flex items-center justify-center p-4 z-[60] backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-5 bg-red-600 flex justify-between items-center text-white">
                    <div>
                        <h2 className="text-lg font-bold">Registrar Feedback</h2>
                        <p className="text-xs text-red-100">Para: {colab.name}</p>
                    </div>
                    <button onClick={onClose} className="text-red-200 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Feedback</label>
                            <select className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-600"
                                onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                <option value="Elogio">Elogio</option>
                                <option value="Ponto de Melhoria">Ponto de Melhoria</option>
                                <option value="Orientação">Orientação</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Meio de Observação</label>
                            <select className="w-full p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-600"
                                onChange={e => setFormData({ ...formData, method: e.target.value })}>
                                <option value="Presencial">Presencial</option>
                                <option value="Sistema">Sistema</option>
                                <option value="Telefonia">Telefonia</option>
                                <option value="Chat">Chat</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Protocolo de Atendimento <span className="text-gray-400 font-normal">(Opcional)</span>
                        </label>
                        <input type="text" placeholder="Ex: 2026041288..." className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                            onChange={e => setFormData({ ...formData, protocol: e.target.value })} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Comentários e Observações</label>
                        <textarea required rows="3" placeholder="Descreva o contexto do feedback..." className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none resize-none"
                            onChange={e => setFormData({ ...formData, comment: e.target.value })}></textarea>
                    </div>

                    <div className="pt-2 flex gap-3">
                        <button type="button" onClick={onClose} className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
                        <button type="submit" disabled={loading} className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
                            {loading ? 'Registrando...' : 'Registrar Feedback'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- COMPONENTE DO MODAL DE RELATÓRIO ---
const ReportDashboardModal = ({ colab, onClose }) => {
    const [dateFilter, setDateFilter] = useState('');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(
            collection(db, "weekly_evaluations"),
            where("colabId", "==", colab.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedData = [];
            snapshot.forEach((doc) => {
                const dbData = doc.data();
                fetchedData.push({
                    id: doc.id,
                    date: dbData.date || 'Semana Atual',
                    finalizados: Number(dbData.Atendimentos_Finalizados) || 0,
                    ligAtendidas: Number(dbData.Ligacoes_Atendidas) || 0,
                    ligPerdidas: Number(dbData.Ligacoes_Perdidas) || 0,
                    huggyVol: Number(dbData.Atendimentos_Huggy) || 0,
                    tmaTel: timeToDecimal(dbData.TMA_Telefonia),
                    tmaHuggy: timeToDecimal(dbData.TMA_Huggy),
                    tme: timeToDecimal(dbData.TME_Telefonia),
                    createdAt: dbData.createdAt
                });
            });

            fetchedData.sort((a, b) => {
                const timeA = a.date !== 'Semana Atual' ? parseDateObj(a.date) : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
                const timeB = b.date !== 'Semana Atual' ? parseDateObj(b.date) : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
                return timeA - timeB; 
            });

            setData(fetchedData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [colab.id]);

    const filterOptions = useMemo(() => {
        const months = new Set();
        const dates = new Set();

        data.forEach(item => {
            const safeDate = item.date;
            if (safeDate && safeDate !== 'Sem data' && safeDate !== 'Semana Atual') {
                dates.add(safeDate);
                const parts = safeDate.split('/');
                if (parts.length === 3) {
                    months.add(`${parts[1]}/${parts[2]}`);
                }
            }
        });

        const sortedDates = Array.from(dates).sort((a, b) => parseDateObj(b) - parseDateObj(a));
        const sortedMonths = Array.from(months).sort((a, b) => {
            const [m1, y1] = a.split('/');
            const [m2, y2] = b.split('/');
            return new Date(y2, m2 - 1, 1).getTime() - new Date(y1, m1 - 1, 1).getTime();
        });

        return { months: sortedMonths, dates: sortedDates };
    }, [data]);

    const filteredData = useMemo(() => {
        return data.filter(item => {
            if (dateFilter === '') return true;
            return item.date.includes(dateFilter);
        });
    }, [data, dateFilter]);

    const currentData = filteredData.length > 0 ? filteredData[filteredData.length - 1] : {
        finalizados: 0, ligAtendidas: 0, ligPerdidas: 0, huggyVol: 0, tmaTel: 0, tme: 0, tmaHuggy: 0
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center z-[70] backdrop-blur-sm">
                <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[70] backdrop-blur-sm">
            <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-5 bg-zinc-950 flex flex-col md:flex-row justify-between items-start md:items-center text-white shrink-0 gap-4">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <FileText className="w-5 h-5 text-red-500" />
                            Relatório de Desempenho
                        </h2>
                        <p className="text-sm text-zinc-400">Analisando métricas de: <span className="text-white font-medium">{colab.name}</span></p>
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                            <select 
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border border-zinc-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm appearance-none bg-zinc-900 cursor-pointer text-white font-medium"
                            >
                                <option value="">Todo o Período</option>
                                {filterOptions.months.length > 0 && (
                                    <optgroup label="Por Mês" className="bg-white text-gray-900">
                                        {filterOptions.months.map(m => <option key={m} value={m}>{m}</option>)}
                                    </optgroup>
                                )}
                                {filterOptions.dates.length > 0 && (
                                    <optgroup label="Datas Específicas" className="bg-white text-gray-900">
                                        {filterOptions.dates.map(d => <option key={d} value={d}>{d}</option>)}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors shrink-0">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {filteredData.length === 0 ? (
                        <div className="text-center py-20 flex flex-col items-center justify-center">
                            <FileText className="w-16 h-16 text-gray-300 mb-4" />
                            <h3 className="text-lg font-bold text-gray-700">Nenhum dado encontrado</h3>
                            <p className="text-gray-500">Ainda não há avaliações lançadas neste período para este colaborador.</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-white border border-gray-200 p-3 rounded-xl flex items-center gap-2 shadow-sm">
                                <Calendar className="w-5 h-5 text-red-600" />
                                <span className="font-medium text-gray-700">Visualizando dados mais recentes em:</span>
                                <span className="font-bold text-gray-900">{currentData.date || 'Último lançamento'}</span>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-gray-700 text-center mb-6 flex items-center justify-center gap-2">
                                        <CheckCircle className="w-4 h-4 text-emerald-500" /> 
                                        Evolução: Atendimentos Finalizados
                                    </h3>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={filteredData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} />
                                                <Tooltip cursor={{fill: '#F3F4F6'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                                <Bar dataKey="finalizados" fill="#86efac" radius={[4, 4, 0, 0]} name="Atendimentos Finalizados" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                        <h3 className="text-sm font-bold text-gray-700 text-center mb-6 flex items-center justify-center gap-2">
                                            <Clock className="w-4 h-4 text-blue-500" /> 
                                            Evolução TMA Telefonia
                                        </h3>
                                        <div className="h-56">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={filteredData}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} tickFormatter={formatTime} />
                                                    <Tooltip contentStyle={{borderRadius: '8px'}} formatter={(value) => formatTime(value)} />
                                                    <Line type="monotone" dataKey="tmaTel" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} name="TMA Telefonia" />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                        <h3 className="text-sm font-bold text-gray-700 text-center mb-6 flex items-center justify-center gap-2">
                                            <MessageSquare className="w-4 h-4 text-purple-500" /> 
                                            Evolução TMA Huggy
                                        </h3>
                                        <div className="h-56">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={filteredData}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} tickFormatter={formatTime} />
                                                    <Tooltip contentStyle={{borderRadius: '8px'}} formatter={(value) => formatTime(value)} />
                                                    <Line type="monotone" dataKey="tmaHuggy" stroke="#a855f7" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} name="TMA Huggy" />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 pt-4">
                                <ReportCard title="Pontuação Total" value={`${calcularPontuacao(currentData)} pts`} valueColor={calcularPontuacao(currentData) < 0 ? "text-red-600" : "text-amber-500"} />
                                <ReportCard title="Atend. Finalizados" value={currentData.finalizados} valueColor="text-emerald-600" />
                                <ReportCard title="Lig. Recebidas" value={currentData.ligAtendidas} icon={<Phone className="w-4 h-4 text-blue-500"/>} />
                                <ReportCard title="Lig. Perdidas" value={currentData.ligPerdidas} valueColor="text-red-600" icon={<PhoneMissed className="w-4 h-4 text-red-500"/>} />
                                <ReportCard title="Vol. Huggy" value={currentData.huggyVol} />
                                <ReportCard title="TMA Tel" value={formatTime(currentData.tmaTel)} valueColor="text-blue-600" />
                                <ReportCard title="TME Tel" value={formatTime(currentData.tme)} />
                                <ReportCard title="TMA Huggy" value={formatTime(currentData.tmaHuggy)} valueColor="text-purple-600" />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const ReportCard = ({ title, value, valueColor = "text-gray-900", icon }) => (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center text-center">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{icon}{title}</div>
        <div className={`text-2xl font-black ${valueColor}`}>{value}</div>
    </div>
);

export default CollaboratorsHub;