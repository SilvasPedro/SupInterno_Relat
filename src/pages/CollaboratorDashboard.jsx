import React, { useState, useEffect, useMemo } from 'react';
import {
    Clock, Target, RefreshCw, Star, Phone, MessageSquare,
    ShieldCheck, Rocket, User, Hourglass, BarChart2, History, LogOut,
    Search, Eye, X, Database, TrendingUp, Users, CheckCircle, Filter,
    KeyRound, Settings, Activity, Calendar, CalendarDays, Network, FileText,
    ThumbsUp, Minus, ThumbsDown
} from 'lucide-react';
import { collection, onSnapshot, query, where, doc, updateDoc } from 'firebase/firestore';
import { updatePassword } from 'firebase/auth';
import { db, auth } from '../services/firebase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { logout } from '../services/auth';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import ReactMarkdown from 'react-markdown';
import Reports from './Reports';
import DailyQueueTracker from './DailyDemandLaunch'
import SundaySchedule from './SundaySchedule'; // ADICIONE ESTA LINHA
import DailySchedule from './DailySchedule';
import OrgChart from './OrgChart';

// Importação da logo estendida
import logoExtended from '../assets/logo_extended.png';
const logo = logoExtended;

// --- DICIONÁRIO DE TRADUÇÃO ---
const translateKey = (key) => {
    const dictionary = {
        createdBy: 'Criado por',
        protocol: 'Protocolo',
        comment: 'Comentário',
        method: 'Meio / Canal',
        type: 'Tipo',
        date: 'Data Referência',
        fcr: 'FCR (%)',
        tmr: 'TMR',
        recurrence: 'Reincidência (%)',
        Atendimentos_Finalizados: 'Atendimentos Finalizados',
        Atendimentos_Huggy: 'Atendimentos Huggy',
        Ligacoes_Atendidas: 'Ligações Atendidas',
        Ligacoes_Perdidas: 'Ligações Perdidas',
        TMA_Telefonia: 'TMA Telefonia',
        TMA_Huggy: 'TMA Huggy',
        TME_Telefonia: 'TME Telefonia',
        pontuacao: 'Pontuação',
        read: 'Status de Leitura',
        status: 'Resultado QA',
        notes: 'Observações do Auditor',
        evaluatorName: 'Auditado por',
        processName: 'Processo Auditado',
        referenceMonth: 'Mês de Referência',
        classification: 'Classificação Geral',
        performance: 'Desempenho e Produtividade',
        performanceScore: 'Nota Desempenho',
        behavior: 'Comportamento e Postura',
        behaviorScore: 'Nota Comportamento',
        punctuality: 'Assiduidade e Pontualidade',
        punctualityScore: 'Nota Assiduidade',
        quality: 'Qualidade e Processos',
        qualityScore: 'Nota Qualidade',
        generalComments: 'Relatório Completo do Mês / Considerações Finais'
    };
    return dictionary[key] || key;
};

// --- FUNÇÃO PARA CONVERTER DATA EM VALOR MATEMÁTICO ---
const parseDateObj = (dateStr) => {
    if (!dateStr) return 0;
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
        }
    }
    if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
        }
    }
    return 0;
};

const formatMonth = (yyyyMm) => {
    if (!yyyyMm) return '--';
    const [year, month] = yyyyMm.split('-');
    return `${month}/${year}`;
};

const getClassificationBadge = (classification) => {
    switch (classification) {
        case 'Positiva': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 flex items-center gap-1 w-max"><ThumbsUp className="w-3 h-3"/> Positiva</span>;
        case 'Neutra': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 flex items-center gap-1 w-max"><Minus className="w-3 h-3"/> Neutra</span>;
        case 'Negativa': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-700 flex items-center gap-1 w-max"><ThumbsDown className="w-3 h-3"/> Negativa</span>;
        default: return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 flex items-center gap-1 w-max"><Minus className="w-3 h-3"/> N/A</span>;
    }
};

const CollaboratorDashboard = ({ currentUserId }) => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const { currentUser } = useAuth();
    const { showToast } = useNotification();

    // Estados do Modal de Senha
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loadingPassword, setLoadingPassword] = useState(false);

    const handleUpdatePassword = async (e) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            showToast("As senhas digitadas não coincidem.", "error");
            return;
        }
        if (newPassword.length < 6) {
            showToast("A senha deve ter pelo menos 6 caracteres.", "error");
            return;
        }

        setLoadingPassword(true);
        try {
            await updatePassword(auth.currentUser, newPassword);
            showToast("Senha alterada com sucesso!", "success");
            setIsPasswordModalOpen(false);
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            // O Firebase exige login recente para trocar a senha. Se o token expirou, pedimos para relogar.
            if (error.code === 'auth/requires-recent-login') {
                showToast("Por segurança, você precisa sair e entrar novamente no sistema para alterar sua senha.", "error");
            } else {
                showToast("Erro ao alterar senha: " + error.message, "error");
            }
        } finally {
            setLoadingPassword(false);
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard':
                return <MyDashboardOverview currentUserId={currentUserId} currentUser={currentUser} />;
            case 'history':
                return <MyHistory currentUserId={currentUserId} />;
            case 'reports':
                return <Reports />;
            case 'schedule':
                return <SundaySchedule readOnly={true} />; // ADICIONE ESTA LINHA
            case 'daily_schedule':
                return <DailySchedule readOnly={true} />;
            case 'orgchart':
                return <OrgChart readOnly={true} />;
            case 'DailyQueueTracker':
                return <DailyQueueTracker />;
            default:
                return <MyDashboardOverview currentUserId={currentUserId} currentUser={currentUser} />;

        }
    };

    return (
        <div className="h-screen bg-gray-50 flex overflow-hidden">
            <aside className="w-64 bg-zinc-950 text-white flex flex-col hidden md:flex shrink-0 border-r border-zinc-800">
                <div className="p-6 flex items-center gap-3 border-b border-zinc-800 shrink-0">
                    <div className="flex items-center border-none border-zinc-800 shrink-0">
                        {/* Tag <img> adicionada aqui para a sua logo estendida */}
                        <img src={logo} alt="HubDesk Logo" className="h-10 w-auto" />
                    </div>
                    <span className="text-lg font-bold tracking-wider">HUB<span className="text-red-500">DESK</span></span>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-hide">
                    <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-red-600/10 text-red-500 border-l-4 border-red-600' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border-l-4 border-transparent'}`}>
                        <BarChart2 className="w-5 h-5" />
                        <span className="font-medium">Dashboard</span>
                    </button>



                    <button onClick={() => setActiveTab('history')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'history' ? 'bg-red-600/10 text-red-500 border-l-4 border-red-600' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border-l-4 border-transparent'}`}>
                        <History className="w-5 h-5" />
                        <span className="font-medium">Meu Histórico</span>
                    </button>

                    {/* ADICIONE O NOVO BOTÃO DA ESCALA AQUI */}
                    <button onClick={() => setActiveTab('schedule')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'schedule' ? 'bg-red-600/10 text-red-500 border-l-4 border-red-600' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border-l-4 border-transparent'}`}>
                        <Calendar className="w-5 h-5" /> <span className="font-medium">Escala de Plantão</span>
                    </button>

                    {/* NOVO BOTÃO: ESCALA DIÁRIA */}
                    <button onClick={() => setActiveTab('daily_schedule')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'daily_schedule' ? 'bg-red-600/10 text-red-500 border-l-4 border-red-600' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border-l-4 border-transparent'}`}>
                        <CalendarDays className="w-5 h-5" /> <span className="font-medium">Escala Diária</span>
                    </button>

                    <button onClick={() => setActiveTab('reports')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'reports' ? 'bg-red-600/10 text-red-500 border-l-4 border-red-600' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border-l-4 border-transparent'}`}>
                        <ShieldCheck className="w-5 h-5" />
                        <span className="font-medium">Relatórios Críticos</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('DailyQueueTracker')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'DailyQueueTracker' ? 'bg-red-600/10 text-red-500 border-l-4 border-red-600' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border-l-4 border-transparent'}`}
                    >
                        <Activity className="w-5 h-5" />
                        <span className="font-medium">Demanda Diária</span>
                    </button>

                    <button onClick={() => setActiveTab('orgchart')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'orgchart' ? 'bg-red-600/10 text-red-500 border-l-4 border-red-600' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border-l-4 border-transparent'}`}>
                        <Network className="w-5 h-5" /> <span className="font-medium">Organograma</span>
                    </button>
                </nav>



                <div className="p-4 border-t border-zinc-800 shrink-0 bg-zinc-950/50">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                            <User className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-medium text-white truncate" title={currentUser?.name}>
                                {currentUser?.name || 'Colaborador'}
                            </p>
                            <p className="text-xs text-zinc-500 truncate" title={currentUser?.role}>
                                {currentUser?.role || 'Atendimento'}
                            </p>
                        </div>
                    </div>

                    <button onClick={() => setIsPasswordModalOpen(true)} className="w-full flex items-center gap-3 px-4 py-2 mb-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                        <KeyRound className="w-4 h-4" />
                        <span className="text-sm font-medium">Alterar senha</span>
                    </button>

                    <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <LogOut className="w-4 h-4" />
                        <span className="text-sm font-medium">Sair do sistema</span>
                    </button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden bg-gray-50 relative">
                {renderContent()}
            </main>

            {/* MODAL DE ALTERAÇÃO DE SENHA */}
            {isPasswordModalOpen && (
                <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[90] backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
                        <div className="p-4 bg-zinc-950 text-white flex justify-between items-center shrink-0">
                            <h3 className="font-bold flex items-center gap-2"><KeyRound className="w-5 h-5 text-red-500" /> Alterar Senha</h3>
                            <button onClick={() => setIsPasswordModalOpen(false)}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                        </div>

                        <form onSubmit={handleUpdatePassword} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
                                <input
                                    type="password"
                                    required
                                    minLength="6"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Nova Senha</label>
                                <input
                                    type="password"
                                    required
                                    minLength="6"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsPasswordModalOpen(false)} className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
                                <button type="submit" disabled={loadingPassword} className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex justify-center items-center">
                                    {loadingPassword ? <Hourglass className="w-5 h-5 text-white" /> : 'Atualizar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

const timeToDecimal = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;
    return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10) + (parseInt(parts[2], 10) / 60);
};

const formatTime = (decimalMinutes) => {
    if (!decimalMinutes && decimalMinutes !== 0) return "00:00:00";
    const totalSeconds = Math.round(decimalMinutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const TrendIndicator = ({ type, current, previous }) => {
    if (!current || !previous) return null;
    let isUp = false; let isGood = false;
    if (type === 'tmr') {
        const curVal = timeToDecimal(current); const prevVal = timeToDecimal(previous);
        if (curVal === prevVal) return null; isUp = curVal > prevVal; isGood = curVal < prevVal;
    } else if (type === 'fcr') {
        const curVal = Number(current); const prevVal = Number(previous);
        if (curVal === prevVal) return null; isUp = curVal > prevVal; isGood = curVal > prevVal;
    } else if (type === 'recurrence') {
        const curVal = Number(current); const prevVal = Number(previous);
        if (curVal === prevVal) return null; isUp = curVal > prevVal; isGood = curVal < prevVal;
    }
    const colorClass = isGood ? "fill-emerald-500" : "fill-red-500";
    const pathObj = isUp ? "M12 4l8 16H4z" : "M12 20l8-16H4z";
    return <svg className={`w-4 h-4 mb-1.5 ${colorClass}`} viewBox="0 0 24 24"><path d={pathObj} /></svg>;
};

// ==========================================
// SUB-COMPONENTE: Visão Geral do Colaborador
// ==========================================
const MyDashboardOverview = ({ currentUserId, currentUser }) => {
    const [loading, setLoading] = useState(true);
    const [globalKpi, setGlobalKpi] = useState({ tmr: '00:00:00', fcr: 0, recurrence: 0 });
    const [prevGlobalKpi, setPrevGlobalKpi] = useState(null);
    const [goals, setGoals] = useState({ tmr: '00:20:00', fcr: 80, recurrence: 20 });
    const [allEvals, setAllEvals] = useState([]);
    const [colabsFull, setColabsFull] = useState({});

    const [myTaskToday, setMyTaskToday] = useState(null);
    const [nextSundayShift, setNextSundayShift] = useState(null);

    const [reportStats, setReportCounts] = useState({ pending: 0, inProgress: 0, resolved: 0 });
    const [unreadFeedbacks, setUnreadFeedbacks] = useState(0);
    const [myAudits, setMyAudits] = useState([]);

    const formatChartDate = (dateString) => {
        if (!dateString) return '';
        const parts = dateString.split('/');
        return parts.length === 3 ? `${parts[0]}/${parts[1]}` : dateString;
    };

    useEffect(() => {

        const unsubSchedule = onSnapshot(doc(db, "daily_schedules", "fixed_schedule"), (docSnap) => {
            if (docSnap.exists()) {
                const assignments = docSnap.data().assignments || {};
                const dayMap = { 0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado' };
                const todayId = dayMap[new Date().getDay()];

                if (todayId && assignments[todayId]) {
                    const dayData = assignments[todayId];
                    let task = null;
                    if (dayData.telefonia?.find(u => u.id === currentUserId)) task = "Telefonia";
                    else if (dayData.huggy?.find(u => u.id === currentUserId)) task = "Huggy";
                    else if (dayData.apoio?.find(u => u.id === currentUserId)) task = "Apoio";
                    setMyTaskToday(task);
                } else {
                    setMyTaskToday(null);
                }
            }
        });

        // LÓGICA CORRIGIDA: Buscar próximo domingo em toda a coleção (todos os meses)
        const qSunday = query(collection(db, "sunday_schedules"));
        const unsubSunday = onSnapshot(qSunday, (querySnapshot) => {
            let next = null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Percorre todos os documentos da coleção (cada documento é um mês)
            querySnapshot.forEach((doc) => {
                const assignments = doc.data().assignments || {};

                // Percorre todos os dias registrados nesse mês
                for (const [dateStr, colabs] of Object.entries(assignments)) {
                    // Verifica se o colaborador está escalado neste dia
                    if (colabs.some(c => c.id === currentUserId)) {
                        const shiftDate = new Date(dateStr + 'T00:00:00');

                        // Se a data for igual ou futura a hoje
                        if (shiftDate >= today) {
                            // Se ainda não temos um próximo, ou se esta data é mais próxima que a anterior salva
                            if (!next || shiftDate < new Date(next)) {
                                next = dateStr;
                            }
                        }
                    }
                }
            });
            setNextSundayShift(next);
        });

        const unsubGoals = onSnapshot(doc(db, "system_settings", "sector_goals"), (docSnap) => {
            if (docSnap.exists()) setGoals(docSnap.data());
        });

        const unsubKpi = onSnapshot(collection(db, "sector_kpis"), (snap) => {
            const kpis = [];
            snap.forEach(d => kpis.push(d.data()));
            kpis.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            if (kpis.length > 0) { setGlobalKpi(kpis[0]); if (kpis.length > 1) setPrevGlobalKpi(kpis[1]); }
        });

        const unsubColabs = onSnapshot(collection(db, "collaborators"), (snap) => {
            const map = {}; snap.forEach(d => map[d.id] = d.data()); setColabsFull(map);
        });

        const unsubEvals = onSnapshot(collection(db, "weekly_evaluations"), (snap) => {
            const evals = []; snap.forEach(d => evals.push({ id: d.id, ...d.data() }));
            evals.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
            setAllEvals(evals); setLoading(false);
        });

        const qReports = query(collection(db, "critical_reports"), where("creatorId", "==", currentUserId));
        const unsubReports = onSnapshot(qReports, (snap) => {
            let pending = 0; let inProgress = 0; let resolved = 0;
            snap.forEach(doc => {
                const data = doc.data();
                if (data.status === 'Pendente') pending++;
                if (data.status === 'Em Andamento') inProgress++;
                if (data.status === 'Resolvido') resolved++;
            });
            setReportCounts({ pending, inProgress, resolved });
        });

        const unsubFeedbacks = onSnapshot(collection(db, "feedbacks"), (snap) => {
            let unreadCount = 0;
            snap.forEach(doc => {
                const data = doc.data();
                if ((data.colabId === currentUserId || data.collaboratorId === currentUserId) && !data.read) {
                    unreadCount++;
                }
            });
            setUnreadFeedbacks(unreadCount);
        });

        const qAudits = query(collection(db, "qa_audits"), where("colabId", "==", currentUserId));
        const unsubAudits = onSnapshot(qAudits, (snap) => {
            const fetched = [];
            snap.forEach(d => fetched.push(d.data()));
            setMyAudits(fetched);
        });



        return () => { unsubKpi(); unsubEvals(); unsubGoals(); unsubColabs(); unsubReports(); unsubFeedbacks(); unsubAudits(); unsubSchedule(); unsubSunday(); };
    }, [currentUserId]);

    const formatDateBR = (dateStr) => {
        if (!dateStr) return '';
        const [_y, m, d] = dateStr.split('-');
        return `${d}/${m}`;
    };

    const qaStats = useMemo(() => {
        const total = myAudits.length;
        const conformes = myAudits.filter(a => a.status === 'Conforme').length;
        const taxa = total > 0 ? ((conformes / total) * 100).toFixed(1) : "0.0";
        return { total, taxa };
    }, [myAudits]);

    const { myStats, chartData, shiftAvgPts } = useMemo(() => {
        const defaultStats = { totalPoints: 0, avgPoints: 0, avgTmaTel: '00:00:00', avgTmaHuggy: '00:00:00' };
        if (allEvals.length === 0) return { myStats: defaultStats, chartData: [], shiftAvgPts: 0 };

        const myEvals = allEvals.filter(e => e.colabId === currentUserId || e.collaboratorId === currentUserId);
        let sumPoints = 0, sumTmaTel = 0, sumTmaHuggy = 0;
        const formattedChartData = [];

        myEvals.forEach(e => {
            let pts = e.pontuacao ?? (Number(e.Atendimentos_Finalizados || 0) * 1 + Number(e.Ligacoes_Atendidas || 0) * 2 + Number(e.Atendimentos_Huggy || 0) * 1 + Number(e.Ligacoes_Perdidas || 0) * -5);
            const telDec = timeToDecimal(e.TMA_Telefonia); const huggyDec = timeToDecimal(e.TMA_Huggy);
            sumPoints += pts; sumTmaTel += telDec; sumTmaHuggy += huggyDec;
            formattedChartData.push({ date: formatChartDate(e.date), pontos: pts, tmaTelDec: telDec, tmaHuggyDec: huggyDec });
        });

        const count = myEvals.length || 1;
        const latestDate = allEvals.reduce((max, e) => (e.date > max ? e.date : max), '');
        const currentWeekAll = allEvals.filter(e => e.date === latestDate);
        const myShift = currentUser?.shift || colabsFull[currentUserId]?.shift || 'Manhã';
        const isDayShift = myShift === 'Manhã' || myShift === 'Tarde';

        let shiftSum = 0; let shiftCount = 0;
        currentWeekAll.forEach(e => {
            const cId = e.colabId || e.collaboratorId;
            const cShift = colabsFull[cId]?.shift || 'Manhã';
            if (isDayShift === (cShift === 'Manhã' || cShift === 'Tarde')) {
                shiftSum += e.pontuacao ?? 0; shiftCount++;
            }
        });

        return {
            myStats: { totalPoints: sumPoints, avgPoints: (sumPoints / count).toFixed(1), avgTmaTel: formatTime(sumTmaTel / count), avgTmaHuggy: formatTime(sumTmaHuggy / count) },
            chartData: formattedChartData,
            shiftAvgPts: shiftCount > 0 ? Math.round(shiftSum / shiftCount) : 0
        };
    }, [allEvals, currentUserId, currentUser, colabsFull]);

    if (loading) {
        return <div className="flex-1 flex items-center justify-center bg-gray-50 h-full"><Hourglass className="w-8 h-8 text-red-600 animate-spin" /></div>;
    }

    return (
        <div className="flex-1 p-6 h-full overflow-y-auto">

            {/* CARDS DE PLANTÃO */}
            <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Card Plantão Hoje */}
                <div className={`p-4 rounded-xl border flex items-center gap-4 shadow-sm ${myTaskToday ? 'bg-red-900 text-white border-red-900 shadow-sm' : 'bg-white border-gray-200'}`}>
                    <div className={`p-3 rounded-lg ${myTaskToday ? 'bg-red-700' : 'bg-gray-100'}`}>
                        <CalendarDays className={`w-6 h-6 ${myTaskToday ? 'text-white' : 'text-gray-500'}`} />
                    </div>
                    <div>
                        <p className={`text-xs font-bold uppercase tracking-widest ${myTaskToday ? 'text-white' : 'text-gray-400'}`}>minha tarefa de hoje</p>
                        <h2 className="text-xl font-black">
                            {myTaskToday ? `${myTaskToday}` : "Sem escala para hoje"}
                        </h2>
                    </div>
                </div>

                {/* Card Próximo Domingo */}
                <div className={`p-4 rounded-xl border flex items-center gap-4 shadow-sm ${nextSundayShift ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white border-gray-200'}`}>
                    <div className={`p-3 rounded-lg ${nextSundayShift ? 'bg-emerald-700' : 'bg-gray-100'}`}>
                        <Users className={`w-6 h-6 ${nextSundayShift ? 'text-white' : 'text-gray-500'}`} />
                    </div>
                    <div>
                        <p className={`text-xs font-bold uppercase tracking-widest ${nextSundayShift ? 'text-emerald-200' : 'text-gray-400'}`}>Próximo Plantão Domingo</p>
                        <h2 className="text-xl font-black">
                            {nextSundayShift ? `Dia ${formatDateBR(nextSundayShift)}` : "Nenhum plantão agendado"}
                        </h2>
                    </div>
                </div>
            </div>
            <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Meu Desempenho</h1>
                    <p className="text-sm text-gray-500">Visão geral de indicadores e qualidade.</p>
                </div>

                <div className="flex flex-wrap gap-4 w-full xl:w-auto mt-4 xl:mt-0">
                    <div className="flex-1 sm:flex-none flex items-center gap-3 bg-fuchsia-50 px-4 py-2.5 rounded-lg border border-fuchsia-100 shadow-sm min-w-[140px]">
                        <div className="p-1.5 bg-fuchsia-500 rounded-md shrink-0">
                            <MessageSquare className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-fuchsia-600 uppercase tracking-tight line-clamp-1">Feedbacks Novos</span>
                            <span className="text-xl font-black text-fuchsia-900 leading-tight">{unreadFeedbacks}</span>
                        </div>
                    </div>

                    <div className="flex-1 sm:flex-none flex items-center gap-3 bg-amber-50 px-4 py-2.5 rounded-lg border border-amber-100 shadow-sm min-w-[140px]">
                        <div className="p-1.5 bg-amber-500 rounded-md shrink-0">
                            <Clock className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-tight line-clamp-1">Relatos Pendentes</span>
                            <span className="text-xl font-black text-amber-900 leading-tight">{reportStats.pending}</span>
                        </div>
                    </div>

                    <div className="flex-1 sm:flex-none flex items-center gap-3 bg-blue-50 px-4 py-2.5 rounded-lg border border-blue-100 shadow-sm min-w-[140px]">
                        <div className="p-1.5 bg-blue-500 rounded-md shrink-0">
                            <Hourglass className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight line-clamp-1">Em Andamento</span>
                            <span className="text-xl font-black text-blue-900 leading-tight">{reportStats.inProgress}</span>
                        </div>
                    </div>

                    <div className="flex-1 sm:flex-none flex items-center gap-3 bg-emerald-50 px-4 py-2.5 rounded-lg border border-emerald-100 shadow-sm min-w-[140px]">
                        <div className="p-1.5 bg-emerald-500 rounded-md shrink-0">
                            <CheckCircle className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight line-clamp-1">Relatos Concluídos</span>
                            <span className="text-xl font-black text-emerald-900 leading-tight">{reportStats.resolved}</span>
                        </div>
                    </div>

                </div>
            </header>


            <div className="mb-8">
                <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-4"><Rocket className="w-4 h-4 text-gray-500" /> KPIs Globais do Setor</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <DashboardCard title="TMR Global" value={globalKpi.tmr || '00:00:00'} subtitle="Tempo Médio Resolução" goalText={`Meta: ≤ ${goals.tmr}`} icon={<Clock className="w-5 h-5 text-purple-500" />} trend={<TrendIndicator type="tmr" current={globalKpi.tmr} previous={prevGlobalKpi?.tmr} />} />
                    <DashboardCard title="FCR Global" value={`${globalKpi.fcr || 0}%`} subtitle="First Call Resolution" goalText={`Meta: ≥ ${goals.fcr}%`} icon={<Target className="w-5 h-5 text-rose-500" />} trend={<TrendIndicator type="fcr" current={globalKpi.fcr} previous={prevGlobalKpi?.fcr} />} />
                    <DashboardCard title="Reincidência" value={`${globalKpi.recurrence || 0}%`} subtitle="Taxa de Retorno" goalText={`Meta: ≤ ${goals.recurrence}%`} icon={<RefreshCw className="w-5 h-5 text-blue-500" />} trend={<TrendIndicator type="recurrence" current={globalKpi.recurrence} previous={prevGlobalKpi?.recurrence} />} />
                </div>
            </div>

            <div className="mb-8">
                <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-4"><User className="w-4 h-4 text-gray-500" /> Minhas Médias (Geral) & Qualidade</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <DashboardCard title="Pontuação (Acumulada)" value={myStats.totalPoints} subtitle={<span>Média semanal: <strong>{myStats.avgPoints} pts</strong></span>} icon={<Star className="w-5 h-5 text-emerald-500" />} />
                    <DashboardCard title="Média do Meu Turno" value={shiftAvgPts} subtitle="Última semana (Equipe)" icon={<Users className="w-5 h-5 text-blue-500" />} />
                    <DashboardCard title="Média TMA Tel" value={myStats.avgTmaTel} subtitle="Tempo médio em linha" icon={<Phone className="w-5 h-5 text-rose-500" />} />
                    <DashboardCard title="Média TMA Chat" value={myStats.avgTmaHuggy} subtitle="Tempo médio no Huggy" icon={<MessageSquare className="w-5 h-5 text-indigo-400" />} />
                    <DashboardCard title="Conformidade QA" value={`${qaStats.taxa}%`} subtitle={`Baseado em ${qaStats.total} auditorias`} icon={<ShieldCheck className="w-5 h-5 text-amber-500" />} />
                </div>
            </div>

            <div>
                <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-4"><TrendingUp className="w-4 h-4 text-gray-500" /> Evolução Temporal</h2>
                {chartData.length === 0 ? <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center text-gray-400">Nenhuma avaliação registrada para desenhar o gráfico.</div> : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-72"><h3 className="text-sm font-bold text-gray-700 mb-4">Produtividade</h3><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="colorPts" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} dy={10} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} /><Area type="monotone" dataKey="pontos" stroke="#10b981" strokeWidth={2} fill="url(#colorPts)" /></AreaChart></ResponsiveContainer></div>
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-72"><h3 className="text-sm font-bold text-gray-700 mb-4">TMA Telefonia</h3><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="colorTel" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} dy={10} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} tickFormatter={formatTime} /><Tooltip contentStyle={{ borderRadius: '8px', border: 'none' }} formatter={val => [formatTime(val), "TMA Tel"]} /><Area type="monotone" dataKey="tmaTelDec" stroke="#3b82f6" strokeWidth={2} fill="url(#colorTel)" /></AreaChart></ResponsiveContainer></div>
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-72"><h3 className="text-sm font-bold text-gray-700 mb-4">TMA Huggy</h3><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="colorHuggy" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} dy={10} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} tickFormatter={formatTime} /><Tooltip contentStyle={{ borderRadius: '8px', border: 'none' }} formatter={val => [formatTime(val), "TMA Huggy"]} /><Area type="monotone" dataKey="tmaHuggyDec" stroke="#8b5cf6" strokeWidth={2} fill="url(#colorHuggy)" /></AreaChart></ResponsiveContainer></div>
                    </div>
                )}
            </div>
        </div>
    );
};

const DashboardCard = ({ title, value, subtitle, goalText, icon, trend }) => (
    <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200 flex flex-col relative overflow-hidden h-full">
        <div className="flex justify-between items-start mb-2">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{title}</h3>
            <div className="p-1 bg-gray-50 rounded-full border border-gray-100">{icon}</div>
        </div>
        <div className="flex items-end gap-2 mt-1"><div className="text-3xl font-extrabold tracking-tight text-gray-900">{value}</div>{trend}</div>
        <div className="mt-2 pt-2 border-t border-gray-50 flex justify-between items-center">
            <div className="text-[10px] text-gray-400 font-medium">{subtitle}</div>
            {goalText && <div className="text-[10px] text-gray-500 font-bold bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{goalText}</div>}
        </div>
    </div>
);

// ==========================================
// SUB-COMPONENTE: MEU HISTÓRICO 
// ==========================================
const MyHistory = ({ currentUserId }) => {
    const { showToast } = useNotification();
    const [activeTab, setActiveTab] = useState('feedbacks');
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('');

    const [data, setData] = useState([]);
    const [qaProcesses, setQaProcesses] = useState({});
    const [loading, setLoading] = useState(true);
    const [viewingItem, setViewingItem] = useState(null);

    const getSafeDateString = item => {
        if (item.date) {
            if (typeof item.date === 'string' && item.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const [y, m, d] = item.date.split('-');
                return `${d}/${m}/${y}`;
            }
            return item.date;
        }
        return item.createdAt ? (typeof item.createdAt.toDate === 'function' ? item.createdAt.toDate().toLocaleDateString('pt-BR') : new Date(item.createdAt).toLocaleDateString('pt-BR')) : 'Sem data';
    };

    useEffect(() => {
        const unsubQA = onSnapshot(collection(db, "qa_processes"), snap => {
            const map = {};
            snap.forEach(d => map[d.id] = d.data());
            setQaProcesses(map);
        });

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        let col = '';
        if (activeTab === 'feedbacks') col = 'feedbacks';
        else if (activeTab === 'metrics') col = 'weekly_evaluations';
        else if (activeTab === 'audits') col = 'qa_audits';
        else if (activeTab === 'monthly') col = 'monthly_evaluations';

        const q = query(collection(db, col));

        const unsub = onSnapshot(q, snap => {
            const res = [];
            snap.forEach(d => {
                const dt = d.data();
                if (dt.colabId === currentUserId || dt.collaboratorId === currentUserId) {
                    res.push({ id: d.id, ...dt });
                }
            });

            res.sort((a, b) => {
                const timeA = a.date ? parseDateObj(a.date) : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
                const timeB = b.date ? parseDateObj(b.date) : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
                return timeB - timeA;
            });

            setData(res);
            setLoading(false);
        });

        return () => { unsubQA(); unsub(); };
    }, [activeTab, currentUserId]);

    const handleMarkAsRead = async (id) => {
        try {
            await updateDoc(doc(db, "feedbacks", id), { read: true });
            showToast("Feedback marcado como lido!", "success");
        } catch {
            showToast("Erro ao atualizar status.", "error");
        }
    };

    const handleViewItem = (item) => {
        setViewingItem(item);
        if (activeTab === 'feedbacks' && !item.read) {
            handleMarkAsRead(item.id);
        }
    };

    const filterOptions = useMemo(() => {
        const months = new Set();
        const dates = new Set();
        data.forEach(item => {
            const safeDate = getSafeDateString(item);
            if (safeDate && safeDate !== 'Sem data') {
                dates.add(safeDate);
                const parts = safeDate.split('/');
                if (parts.length === 3) months.add(`${parts[1]}/${parts[2]}`);
            }
        });
        return {
            months: Array.from(months).sort((a, b) => b.localeCompare(a)),
            dates: Array.from(dates).sort((a, b) => parseDateObj(b) - parseDateObj(a))
        };
    }, [data]);

    const filteredData = data.filter(i => {
        const matchSearch = searchTerm === '' || (i.type && i.type.toLowerCase().includes(searchTerm.toLowerCase()));
        const safeDate = getSafeDateString(i);
        const matchDate = dateFilter === '' || safeDate.includes(dateFilter);
        return matchSearch && matchDate;
    });

    return (
        <div className="flex-1 p-6 h-full overflow-y-auto flex flex-col">
            <header className="mb-6 bg-white p-6 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><History className="w-6 h-6 text-red-600" />Meu Histórico</h1>
                <p className="text-sm text-gray-500">Acompanhe seus lançamentos e avaliações recebidas.</p>
            </header>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 shrink-0 space-y-4">
                <div className="flex space-x-2 border-b border-gray-100 pb-4 overflow-x-auto">
                    <button onClick={() => setActiveTab('feedbacks')} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'feedbacks' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                        <MessageSquare className="w-4 h-4" /> Feedbacks
                    </button>
                    <button onClick={() => setActiveTab('metrics')} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'metrics' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                        <TrendingUp className="w-4 h-4" /> Semanal
                    </button>
                    <button onClick={() => setActiveTab('monthly')} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'monthly' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                        <FileText className="w-4 h-4" /> Mensal
                    </button>
                    <button onClick={() => setActiveTab('audits')} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'audits' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                        <ShieldCheck className="w-4 h-4" /> Auditorias
                    </button>
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                        <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg outline-none text-sm" />
                    </div>

                    <div className="md:w-64 relative">
                        <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                        <select
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-sm appearance-none bg-white cursor-pointer text-gray-600 font-medium"
                        >
                            <option value="">Todo o Período</option>
                            {filterOptions.months.length > 0 && (
                                <optgroup label="Por Mês">
                                    {filterOptions.months.map(m => <option key={m} value={m}>{m}</option>)}
                                </optgroup>
                            )}
                            {filterOptions.dates.length > 0 && (
                                <optgroup label="Datas Específicas">
                                    {filterOptions.dates.map(d => <option key={d} value={d}>{d}</option>)}
                                </optgroup>
                            )}
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                {loading ? <div className="flex-1 flex items-center justify-center"><Hourglass className="w-8 h-8 text-red-600" /></div> : filteredData.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center"><Database className="w-12 h-12 mb-3 opacity-20" /><p className="text-lg font-medium text-gray-500">Nenhum registro encontrado.</p></div> : (
                    <div className="overflow-x-auto flex-1">
                        <table className="min-w-full divide-y divide-gray-200 text-sm whitespace-nowrap">
                            <thead className="bg-zinc-950 text-white sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-3 text-left font-semibold">Data</th>
                                    <th className="px-6 py-3 text-left font-semibold">Resumo</th>
                                    <th className="px-6 py-3 text-right font-semibold">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredData.map(i => (
                                    <tr key={i.id} className={`hover:bg-gray-50 transition-colors ${activeTab === 'feedbacks' && !i.read ? 'bg-fuchsia-50/20' : ''}`}>
                                        <td className="px-6 py-4 text-gray-500">{getSafeDateString(i)}</td>
                                        <td className="px-6 py-4">
                                            {activeTab === 'feedbacks' && (
                                                <div className="flex items-center gap-2">
                                                    {!i.read && <span className="w-2 h-2 rounded-full bg-fuchsia-500"></span>}
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${i.type === 'Elogio' ? 'bg-emerald-100 text-emerald-700' : i.type === 'Ponto de Melhoria' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{i.type}</span>
                                                </div>
                                            )}
                                            {activeTab === 'metrics' && (
                                                <span className="text-gray-600">Pontuação: <strong className="text-gray-900">{i.pontuacao || 0} pts</strong></span>
                                            )}
                                            {activeTab === 'monthly' && (
                                                <span className="text-gray-600">Mês: <strong className="text-gray-900">{i.referenceMonth || '--'}</strong> | Classificação: <strong className="text-gray-900">{i.classification || '--'}</strong></span>
                                            )}
                                            {activeTab === 'audits' && (
                                                <span className="text-gray-600">
                                                    Status: <strong className={i.status === 'Conforme' ? 'text-emerald-600' : 'text-red-600'}>{i.status}</strong> | Protocolo: <strong className="text-gray-900">{i.protocol || '--'}</strong>
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right flex justify-end gap-4 items-center">
                                            {activeTab === 'feedbacks' && !i.read && (
                                                <button onClick={(e) => { e.stopPropagation(); handleMarkAsRead(i.id); }} className="text-[11px] font-bold text-fuchsia-600 hover:text-fuchsia-700 uppercase transition-colors">Marcar como lido</button>
                                            )}
                                            <button onClick={() => handleViewItem(i)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1">
                                                <Eye className="w-4 h-4" /> <span className="text-xs font-bold">Ler</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {viewingItem && (
                activeTab === 'monthly' ? (
                    <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
                        <div className="bg-gray-100 rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                                        <CalendarDays className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-lg text-gray-900 leading-tight">Relatório de Avaliação Mensal</h3>
                                        <p className="text-xs text-gray-500">Mês de Referência: <strong className="text-gray-700">{formatMonth(viewingItem.referenceMonth)}</strong></p>
                                    </div>
                                </div>
                                <button onClick={() => setViewingItem(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
                            </div>
                            
                            <div className="p-6 overflow-y-auto flex-1">
                                <div className="bg-white p-8 rounded border border-gray-200 shadow-sm mx-auto max-w-3xl">
                                    <div className="border-b-2 border-gray-900 pb-4 mb-6 flex justify-between items-end">
                                        <div>
                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Colaborador Avaliado</span>
                                            <span className="text-2xl font-black text-gray-900 flex items-center gap-3">
                                                {viewingItem.colabName}
                                                {getClassificationBadge(viewingItem.classification)}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Avaliador Responsável</span>
                                            <span className="text-base font-bold text-gray-700">{viewingItem.evaluatorName}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-8 markdown-body">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                                    <Star className="w-4 h-4 text-amber-500"/> Desempenho e Produtividade
                                                </h4>
                                                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">Nota: <strong className="text-gray-900 text-sm">{viewingItem.performanceScore || '-'}</strong>/10</span>
                                            </div>
                                            <div className="text-gray-800 text-sm prose prose-sm max-w-none">
                                                <ReactMarkdown>{viewingItem.performance || '*Sem observações neste pilar.*'}</ReactMarkdown>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                                    <ShieldCheck className="w-4 h-4 text-emerald-500"/> Qualidade e Processos
                                                </h4>
                                                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">Nota: <strong className="text-gray-900 text-sm">{viewingItem.qualityScore || '-'}</strong>/10</span>
                                            </div>
                                            <div className="text-gray-800 text-sm prose prose-sm max-w-none">
                                                <ReactMarkdown>{viewingItem.quality || '*Sem observações neste pilar.*'}</ReactMarkdown>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                                    <User className="w-4 h-4 text-blue-500"/> Comportamento e Postura
                                                </h4>
                                                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">Nota: <strong className="text-gray-900 text-sm">{viewingItem.behaviorScore || '-'}</strong>/10</span>
                                            </div>
                                            <div className="text-gray-800 text-sm prose prose-sm max-w-none">
                                                <ReactMarkdown>{viewingItem.behavior || '*Sem observações neste pilar.*'}</ReactMarkdown>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                                    <Clock className="w-4 h-4 text-purple-500"/> Assiduidade e Pontualidade
                                                </h4>
                                                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">Nota: <strong className="text-gray-900 text-sm">{viewingItem.punctualityScore || '-'}</strong>/10</span>
                                            </div>
                                            <div className="text-gray-800 text-sm prose prose-sm max-w-none">
                                                <ReactMarkdown>{viewingItem.punctuality || '*Sem observações neste pilar.*'}</ReactMarkdown>
                                            </div>
                                        </div>

                                        {viewingItem.generalComments && (
                                            <div className="space-y-2 pt-4 mt-6 border-t-2 border-gray-100">
                                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                                    <MessageSquare className="w-4 h-4 text-gray-500"/> Relatório Completo do Mês / Considerações Finais
                                                </h4>
                                                <div className="text-gray-800 text-sm prose prose-sm max-w-none bg-gray-50 p-4 rounded-lg border border-gray-200">
                                                    <ReactMarkdown>{viewingItem.generalComments}</ReactMarkdown>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-4 bg-white border-t border-gray-200 flex justify-end shrink-0">
                                <button onClick={() => setViewingItem(null)} className="px-8 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-black transition-colors">Fechar Documento</button>
                            </div>
                        </div>
                    </div>
                ) : (
                <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
                    <div className={`bg-white rounded-xl shadow-2xl w-full ${activeTab === 'audits' ? 'max-w-2xl' : 'max-w-md'} overflow-hidden flex flex-col max-h-[90vh]`}>
                        <div className="p-4 bg-zinc-950 text-white flex justify-between items-center shrink-0">
                            <h3 className="font-bold">Detalhes</h3>
                            <button onClick={() => setViewingItem(null)}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                        </div>
                        <div className="p-6 space-y-4 text-sm overflow-y-auto flex-1">
                            {Object.entries(viewingItem).map(([k, v]) => {
                                // Ocultando os campos de controle
                                if (['id', 'createdAt', 'updatedAt', 'colabId', 'collaboratorId', 'colabName', 'read', 'evaluatorId', 'checklistResults', 'processId'].includes(k)) return null;

                                let displayValue = v;
                                if (v && typeof v === 'object') {
                                    if (typeof v.toDate === 'function') {
                                        displayValue = v.toDate().toLocaleString('pt-BR');
                                    } else if (v.seconds !== undefined) {
                                        displayValue = new Date(v.seconds * 1000).toLocaleString('pt-BR');
                                    } else {
                                        displayValue = JSON.stringify(v);
                                    }
                                }

                                return (
                                    <div key={k} className="border-b border-gray-100 pb-2">
                                        <span className="block text-xs font-bold text-gray-400 uppercase">{translateKey(k)}</span>
                                        <span className="block text-gray-900 mt-1 whitespace-pre-wrap">{displayValue?.toString() || 'Vazio'}</span>
                                    </div>
                                );
                            })}

                            {/* EXIBIÇÃO DEDICADA DA CHECKLIST DE AUDITORIA */}
                            {activeTab === 'audits' && viewingItem.checklistResults && Object.keys(viewingItem.checklistResults).length > 0 && (
                                <div className="mt-6 border-t border-gray-200 pt-4">
                                    <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <ShieldCheck className="w-4 h-4 text-red-500" /> Checklist da Avaliação
                                    </h4>
                                    <div className="space-y-3">
                                        {Object.entries(viewingItem.checklistResults).map(([idx, status]) => {
                                            const process = qaProcesses[viewingItem.processId];
                                            const question = process?.checklist?.[idx] || `Item de verificação ${Number(idx) + 1}`;

                                            let statusColor = "text-gray-600 bg-gray-100 border-gray-200";
                                            if (status === 'Passou') statusColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
                                            if (status === 'Falhou') statusColor = "text-red-700 bg-red-50 border-red-200";

                                            return (
                                                <div key={idx} className="flex justify-between items-start gap-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
                                                    <span className="text-sm text-gray-700 font-medium leading-snug">{question}</span>
                                                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 border ${statusColor}`}>
                                                        {status}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                        </div>
                        <div className="p-4 bg-gray-50 border-t border-gray-200 shrink-0">
                            <button onClick={() => setViewingItem(null)} className="w-full py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300">Fechar</button>
                        </div>
                    </div>
                </div>
                )
            )}
        </div>
    );
};

export default CollaboratorDashboard;