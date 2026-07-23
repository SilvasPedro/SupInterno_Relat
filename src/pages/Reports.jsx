import React, { useState, useEffect } from 'react';
import { 
    AlertOctagon, Plus, Search, Eye, Edit2, Trash2, X, Loader2, 
    AlertTriangle, FileText, CheckCircle, Clock, Filter, 
    Lightbulb, Monitor, Building, Zap, Bug, MessageSquare, Send
} from 'lucide-react';
import { collection, onSnapshot, query, doc, addDoc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const Reports = () => {
    const { showToast } = useNotification();
    const { currentUser } = useAuth(); // CORREÇÃO: Usando apenas currentUser
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');

    // Controles de Modais
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewingReport, setViewingReport] = useState(null);
    const [deletingReport, setDeletingReport] = useState(null);
    
    // Formulário de Criação/Edição (Apenas dados da solicitação)
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        type: 'Análise de Erro', 
        priority: 'Normal', 
        date: new Date().toISOString().split('T')[0],
        affectedClient: 'Não',
        howAffected: '',
        protocol: '',
        description: '',
        status: 'Pendente'
    });
    const [saving, setSaving] = useState(false);

    // Controles Rápidos de Admin (Dentro do Modal de Visualização)
    const [quickStatus, setQuickStatus] = useState('');
    const [quickComment, setQuickComment] = useState('');
    const [quickSaving, setQuickSaving] = useState(false);

    // --- PERMISSÕES CORRIGIDAS ---
    const isAdmin = currentUser?.role === 'Admin';
    const canEditOrDelete = (report) => isAdmin || report.creatorId === currentUser?.firestoreId;
    

    // --- BUSCA DE DADOS ---
    useEffect(() => {
        if (!currentUser) return;

        let q;
        // CORREÇÃO: Verifica a patente diretamente dentro do currentUser
        if (isAdmin) { 
            q = query(collection(db, "critical_reports"));
        } else {
            q = query(collection(db, "critical_reports"), where("creatorId", "==", currentUser.firestoreId));
        }
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedData = [];
            snapshot.forEach((doc) => {
                fetchedData.push({ id: doc.id, ...doc.data() });
            });
            
            // Ordenação pelo mais recente
            fetchedData.sort((a, b) => {
                const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                return dateB - dateA;
            });
            
            setReports(fetchedData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, isAdmin]);

    // --- TRATAMENTO DE DADOS LEGADOS ---
    const getDisplayTitle = (r) => {
        if (r.title) return r.title;
        // Se for um relatório antigo sem título, cria um a partir da descrição
        if (r.description) return `[Legado] ${r.description.substring(0, 45)}...`;
        return 'Relatório Sem Título';
    };

    // --- FILTRAGEM ---
    const filteredReports = reports.filter(r => {
        const titleSafe = getDisplayTitle(r).toLowerCase();
        const matchSearch = searchTerm === '' || 
            titleSafe.includes(searchTerm.toLowerCase()) ||
            (r.description && r.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (r.protocol && r.protocol.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (r.creatorName && r.creatorName.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchStatus = statusFilter === '' || r.status === statusFilter;
        const matchType = typeFilter === '' || r.type === typeFilter;

        return matchSearch && matchStatus && matchType;
    });

    // --- AÇÕES DE SOLICITAÇÃO ---
    const openNewReportModal = () => {
        setEditingId(null);
        setFormData({
            title: '', type: 'Análise de Erro', priority: 'Normal', 
            date: new Date().toISOString().split('T')[0], affectedClient: 'Não', 
            howAffected: '', protocol: '', description: '', status: 'Pendente'
        });
        setIsModalOpen(true);
    };

    const openEditModal = (report) => {
        setEditingId(report.id);
        setFormData({
            title: report.title || '',
            type: report.type || 'Análise de Erro',
            priority: report.priority || 'Normal',
            date: report.date || '',
            affectedClient: report.affectedClient || 'Não',
            howAffected: report.howAffected || '',
            protocol: report.protocol || '',
            description: report.description || '',
            status: report.status || 'Pendente'
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.description.trim()) {
            showToast("A descrição da solicitação é obrigatória.", "error");
            return;
        }

        setSaving(true);
        try {
            const reportPayload = { ...formData, updatedAt: new Date() };
            if (!reportPayload.title) reportPayload.title = `[Ajuste] ${reportPayload.description.substring(0,30)}...`;

            if (editingId) {
                await updateDoc(doc(db, "critical_reports", editingId), reportPayload);
                showToast("Solicitação atualizada com sucesso!", "success");
            } else {
                reportPayload.creatorId = currentUser.firestoreId;
                reportPayload.creatorName = currentUser.name;
                reportPayload.createdAt = new Date();
                await addDoc(collection(db, "critical_reports"), reportPayload);
                showToast("Solicitação enviada com sucesso!", "success");
            }
            setIsModalOpen(false);
        } catch (error) {
            showToast("Erro ao salvar: " + error.message, "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            await deleteDoc(doc(db, "critical_reports", deletingReport.id));
            showToast("Solicitação excluída permanentemente.", "success");
            setDeletingReport(null);
        } catch {
            showToast("Erro ao excluir.", "error");
        }
    };

    // --- AÇÕES DO GESTOR NO MODAL DE VISUALIZAÇÃO ---
    const handleOpenViewModal = (report) => {
        setViewingReport(report);
        setQuickStatus(report.status || 'Pendente');
        setQuickComment(report.adminComment || report.closingComment || ''); 
    };

    const handleQuickUpdate = async () => {
        setQuickSaving(true);
        try {
            await updateDoc(doc(db, "critical_reports", viewingReport.id), {
                status: quickStatus,
                adminComment: quickComment,
                updatedAt: new Date()
            });
            showToast("Andamento do ticket atualizado!", "success");
            setViewingReport(prev => ({ ...prev, status: quickStatus, adminComment: quickComment }));
        } catch {
            showToast("Erro ao atualizar ticket.", "error");
        } finally {
            setQuickSaving(false);
        }
    };

    // --- UI HELPERS ---
    const getStatusBadge = (status) => {
        switch (status) {
            case 'Resolvido':
            case 'Concluído':
                return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 flex items-center gap-1 w-max"><CheckCircle className="w-3 h-3"/> {status}</span>;
            case 'Em Andamento':
                return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 flex items-center gap-1 w-max"><Loader2 className="w-3 h-3 animate-spin"/> Em Andamento</span>;
            case 'Recusado':
            case 'Cancelado':
                return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700 flex items-center gap-1 w-max"><X className="w-3 h-3"/> {status}</span>;
            default:
                return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 flex items-center gap-1 w-max"><Clock className="w-3 h-3"/> Pendente</span>;
        }
    };

    const getTypeIcon = (type) => {
        if (!type) return <Bug className="w-4 h-4 text-gray-400" />;
        if (type.includes('Sistema')) return <Monitor className="w-4 h-4 text-blue-500" />;
        if (type.includes('Ambiente')) return <Building className="w-4 h-4 text-emerald-500" />;
        return <Bug className="w-4 h-4 text-red-500" />;
    };

    const getPriorityBadge = (priority) => {
        switch (priority) {
            case 'Alta': return <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">Alta</span>;
            case 'Baixa': return <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">Baixa</span>;
            case 'Normal': return <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">Normal</span>;
            default: return null; 
        }
    };

    if (loading) {
        return <div className="flex-1 flex items-center justify-center bg-gray-50 h-full"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>;
    }

    return (
        <div className="flex-1 p-6 h-full overflow-y-auto bg-gray-50 flex flex-col">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Lightbulb className="w-6 h-6 text-red-600" />
                        Central de Solicitações
                    </h1>
                    <p className="text-sm text-gray-500">Lançamento de tarefas, reporte de erros sistêmicos e melhorias.</p>
                </div>
                <button 
                    onClick={openNewReportModal}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors shadow-sm"
                >
                    <Plus className="w-5 h-5" /> Nova Solicitação
                </button>
            </header>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 shrink-0 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                    <input 
                        type="text" 
                        placeholder="Buscar por título, contexto, protocolo ou autor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-sm transition-all"
                    />
                </div>
                
                <div className="w-full md:w-48 relative">
                    <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                    <select 
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-sm appearance-none bg-white cursor-pointer text-gray-600 font-medium"
                    >
                        <option value="">Todos os Tipos</option>
                        <option value="Análise de Erro">Análise de Erro</option>
                        <option value="Melhoria de Sistema">Melhoria de Sistema</option>
                        <option value="Melhoria de Ambiente">Melhoria de Ambiente</option>
                    </select>
                </div>

                <div className="w-full md:w-48 relative">
                    <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                    <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-sm appearance-none bg-white cursor-pointer text-gray-600 font-medium"
                    >
                        <option value="">Todos os Status</option>
                        <option value="Pendente">Pendente</option>
                        <option value="Em Andamento">Em Andamento</option>
                        <option value="Resolvido">Concluído/Resolvido</option>
                        <option value="Cancelado">Cancelado/Recusado</option>
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                {filteredReports.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                        <Lightbulb className="w-12 h-12 mb-3 opacity-20" />
                        <p className="text-lg font-medium text-gray-500">Nenhuma solicitação encontrada.</p>
                        <p className="text-sm mt-1">Nenhum ticket corresponde à sua busca ou filtro atual.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto flex-1">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-zinc-950 text-white sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-3 text-left font-semibold">Data</th>
                                    <th className="px-6 py-3 text-left font-semibold">Status</th>
                                    <th className="px-6 py-3 text-left font-semibold">Tipo</th>
                                    <th className="px-6 py-3 text-left font-semibold">Resumo / Título</th>
                                    <th className="px-6 py-3 text-left font-semibold">Solicitante</th>
                                    <th className="px-6 py-3 text-right font-semibold">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredReports.map((report) => (
                                    <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                                            {report.date ? new Date(report.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '--'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getStatusBadge(report.status)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2 font-medium text-gray-700">
                                                {getTypeIcon(report.type)}
                                                {report.type || 'Análise de Erro'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-gray-900 max-w-[250px] truncate" title={getDisplayTitle(report)}>
                                                    {getDisplayTitle(report)}
                                                </span>
                                                {getPriorityBadge(report.priority)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 font-medium">
                                            {report.creatorName || 'Desconhecido'}
                                        </td>
                                        
                                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                                            <button onClick={() => handleOpenViewModal(report)} className="p-2 text-blue-600 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors border border-transparent hover:border-blue-100" title="Ver Detalhes e Andamento">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            
                                            {canEditOrDelete(report) && (
                                                <>
                                                    <button onClick={() => openEditModal(report)} className="p-2 text-amber-600 hover:bg-amber-50 hover:text-amber-700 rounded-lg transition-colors border border-transparent hover:border-amber-100" title="Editar">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => setDeletingReport(report)} className="p-2 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors border border-transparent hover:border-red-100" title="Excluir">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL DE CRIAÇÃO / EDIÇÃO - (Apenas Dados) */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-5 bg-zinc-950 text-white flex justify-between items-center shrink-0">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Lightbulb className="w-5 h-5 text-red-500" />
                                {editingId ? 'Editar Detalhes da Solicitação' : 'Nova Solicitação / Tarefa'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                            <form id="reportForm" onSubmit={handleSubmit} className="space-y-8">
                                
                                {/* CLASSIFICAÇÃO */}
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2">1. O que você precisa registrar?</h4>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <label className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center text-center transition-all ${formData.type === 'Análise de Erro' ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white hover:border-red-200'}`}>
                                            <input type="radio" name="type" value="Análise de Erro" checked={formData.type === 'Análise de Erro'} onChange={(e) => setFormData({...formData, type: e.target.value})} className="hidden" />
                                            <Bug className={`w-8 h-8 mb-2 ${formData.type === 'Análise de Erro' ? 'text-red-600' : 'text-gray-400'}`} />
                                            <span className={`font-bold text-sm ${formData.type === 'Análise de Erro' ? 'text-red-900' : 'text-gray-700'}`}>Análise de Erro</span>
                                            <span className="text-[10px] text-gray-500 mt-1">Falhas em processos ou ferramentas</span>
                                        </label>

                                        <label className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center text-center transition-all ${formData.type === 'Melhoria de Sistema' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-200'}`}>
                                            <input type="radio" name="type" value="Melhoria de Sistema" checked={formData.type === 'Melhoria de Sistema'} onChange={(e) => setFormData({...formData, type: e.target.value})} className="hidden" />
                                            <Monitor className={`w-8 h-8 mb-2 ${formData.type === 'Melhoria de Sistema' ? 'text-blue-600' : 'text-gray-400'}`} />
                                            <span className={`font-bold text-sm ${formData.type === 'Melhoria de Sistema' ? 'text-blue-900' : 'text-gray-700'}`}>Melhoria de Sistema</span>
                                            <span className="text-[10px] text-gray-500 mt-1">Sugestões para o Hubdesk ou outros</span>
                                        </label>

                                        <label className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center text-center transition-all ${formData.type === 'Melhoria de Ambiente' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:border-emerald-200'}`}>
                                            <input type="radio" name="type" value="Melhoria de Ambiente" checked={formData.type === 'Melhoria de Ambiente'} onChange={(e) => setFormData({...formData, type: e.target.value})} className="hidden" />
                                            <Building className={`w-8 h-8 mb-2 ${formData.type === 'Melhoria de Ambiente' ? 'text-emerald-600' : 'text-gray-400'}`} />
                                            <span className={`font-bold text-sm ${formData.type === 'Melhoria de Ambiente' ? 'text-emerald-900' : 'text-gray-700'}`}>Melhoria de Ambiente</span>
                                            <span className="text-[10px] text-gray-500 mt-1">Infraestrutura, cadeira, ar, etc.</span>
                                        </label>
                                    </div>

                                    <div className="pt-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nível de Urgência (Prioridade)</label>
                                        <div className="flex bg-white border border-gray-200 rounded-lg p-1 w-max">
                                            <label className={`cursor-pointer px-4 py-2 text-xs font-bold rounded-md transition-all ${formData.priority === 'Baixa' ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-50'}`}>
                                                <input type="radio" name="priority" value="Baixa" checked={formData.priority === 'Baixa'} onChange={(e) => setFormData({...formData, priority: e.target.value})} className="hidden" />
                                                Baixa
                                            </label>
                                            <label className={`cursor-pointer px-4 py-2 text-xs font-bold rounded-md transition-all ${formData.priority === 'Normal' ? 'bg-amber-100 text-amber-700 shadow-sm' : 'text-gray-500 hover:bg-amber-50'}`}>
                                                <input type="radio" name="priority" value="Normal" checked={formData.priority === 'Normal'} onChange={(e) => setFormData({...formData, priority: e.target.value})} className="hidden" />
                                                Normal
                                            </label>
                                            <label className={`cursor-pointer px-4 py-2 text-xs font-bold rounded-md transition-all ${formData.priority === 'Alta' ? 'bg-red-100 text-red-700 shadow-sm' : 'text-gray-500 hover:bg-red-50'}`}>
                                                <input type="radio" name="priority" value="Alta" checked={formData.priority === 'Alta'} onChange={(e) => setFormData({...formData, priority: e.target.value})} className="hidden" />
                                                Alta
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* CONTEXTO */}
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2">2. Detalhes da Solicitação</h4>
                                    
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Resumo em uma linha (Título)</label>
                                            <input type="text" placeholder="Ex: Adicionar botão de exportar na tela X..." value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none font-bold text-gray-900" />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição Completa</label>
                                            <textarea required rows="4" placeholder="Descreva o que está acontecendo, como deveria ser ou o que você sugere..." value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none resize-none text-sm text-gray-700" />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data da observação</label>
                                                <input type="date" required value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Protocolo vinculado <span className="font-normal normal-case">(Opcional)</span></label>
                                                <input type="text" placeholder="Nº do Ticket se houver" value={formData.protocol} onChange={(e) => setFormData({...formData, protocol: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-sm" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* CONDICIONAL DE ERROS */}
                                {formData.type === 'Análise de Erro' && (
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2">3. Impacto Operacional</h4>
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Afetou a experiência do cliente?</label>
                                                <select required value={formData.affectedClient} onChange={(e) => setFormData({...formData, affectedClient: e.target.value})} className="w-full sm:w-64 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-sm font-medium">
                                                    <option value="Não">Não (Erro interno apenas)</option>
                                                    <option value="Sim">Sim (Impacto no atendimento)</option>
                                                </select>
                                            </div>

                                            {formData.affectedClient === 'Sim' && (
                                                <div className="bg-red-50 p-3 rounded-lg border border-red-100 animate-in fade-in slide-in-from-top-2">
                                                    <label className="block text-xs font-bold text-red-800 uppercase mb-1">Como afetou o cliente?</label>
                                                    <textarea required rows="2" placeholder="Descreva o impacto..." value={formData.howAffected} onChange={(e) => setFormData({...formData, howAffected: e.target.value})} className="w-full p-2 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-600 outline-none bg-white text-sm" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </form>
                        </div>
                        
                        <div className="p-4 bg-white border-t border-gray-200 flex gap-3 shrink-0">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-bold transition-colors">Cancelar</button>
                            <button type="submit" form="reportForm" disabled={saving} className="flex-1 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors disabled:opacity-70 flex justify-center items-center gap-2 shadow-sm">
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                                Salvar Solicitação
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE VISUALIZAÇÃO E AÇÕES DE TICKET */}
            {viewingReport && (
                <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-5 bg-zinc-950 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-zinc-800 rounded-lg">
                                    {getTypeIcon(viewingReport.type)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg leading-tight truncate max-w-[400px]" title={getDisplayTitle(viewingReport)}>
                                        {getDisplayTitle(viewingReport)}
                                    </h3>
                                    <p className="text-xs text-zinc-400">Enviado por {viewingReport.creatorName || 'Desconhecido'}</p>
                                </div>
                            </div>
                            <button onClick={() => setViewingReport(null)} className="p-1 hover:bg-zinc-800 rounded-lg"><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6 lg:flex-row">
                            
                            {/* LADO ESQUERDO: Detalhes da Solicitação */}
                            <div className="flex-1 space-y-6">
                                <div className="flex flex-wrap gap-4 border-b border-gray-100 pb-4">
                                    <div className="flex-1 min-w-[120px]">
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Status Atual</span>
                                        {getStatusBadge(viewingReport.status)}
                                    </div>
                                    <div className="flex-1 min-w-[120px]">
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Prioridade</span>
                                        {getPriorityBadge(viewingReport.priority || 'Normal') || <span className="text-xs text-gray-500">N/A</span>}
                                    </div>
                                    <div className="flex-1 min-w-[120px]">
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Data Criação</span>
                                        <span className="block font-bold text-gray-900">{viewingReport.date ? new Date(viewingReport.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '--'}</span>
                                    </div>
                                </div>
                                
                                <div>
                                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Descrição Completa</span>
                                    <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 p-4 rounded-xl border border-gray-100 leading-relaxed">{viewingReport.description || 'Sem descrição'}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tipo de Solicitação</span>
                                        <span className="block text-sm font-medium text-gray-900">{viewingReport.type || 'Análise de Erro'}</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Protocolo Vinculado</span>
                                        <span className="block text-sm font-medium text-gray-900">{viewingReport.protocol || 'Nenhum'}</span>
                                    </div>
                                </div>

                                {viewingReport.type === 'Análise de Erro' && viewingReport.affectedClient === 'Sim' && (
                                    <div className="p-4 rounded-xl bg-red-50 border border-red-100">
                                        <span className="block text-[10px] font-black uppercase text-red-800 tracking-widest mb-2">Impacto no Cliente</span>
                                        <p className="text-sm text-red-900 whitespace-pre-wrap">{viewingReport.howAffected}</p>
                                    </div>
                                )}
                            </div>

                            {/* LADO DIREITO: Ações do Ticket (Admin) / Feed de Andamento (Usuário) */}
                            <div className="w-full lg:w-72 flex flex-col gap-4">
                                {isAdmin ? (
                                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 shadow-sm flex flex-col gap-4 h-full">
                                        <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest flex items-center gap-2 border-b border-blue-200 pb-2">
                                            <Monitor className="w-4 h-4"/> Gestão do Ticket
                                        </h4>
                                        
                                        <div>
                                            <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Mudar Status</label>
                                            <select value={quickStatus} onChange={(e) => setQuickStatus(e.target.value)} className="w-full p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none bg-white font-bold text-blue-900 text-sm shadow-sm">
                                                <option value="Pendente">Pendente (Na fila)</option>
                                                <option value="Em Andamento">Em Andamento</option>
                                                <option value="Resolvido">Concluído / Resolvido</option>
                                                <option value="Cancelado">Recusado / Cancelado</option>
                                            </select>
                                        </div>

                                        <div className="flex-1 flex flex-col">
                                            <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Comentário / Resolução</label>
                                            <textarea 
                                                rows="5" 
                                                placeholder="Para remover, basta apagar o texto..." 
                                                value={quickComment} 
                                                onChange={(e) => setQuickComment(e.target.value)} 
                                                className="w-full flex-1 p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none bg-white text-gray-800 text-sm shadow-sm resize-none" 
                                            />
                                        </div>

                                        <button 
                                            onClick={handleQuickUpdate} 
                                            disabled={quickSaving}
                                            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition-colors disabled:opacity-70 flex items-center justify-center gap-2 shadow-sm"
                                        >
                                            {quickSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                            Salvar Andamento
                                        </button>
                                    </div>
                                ) : (
                                    viewingReport.adminComment || viewingReport.closingComment ? (
                                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 h-full flex flex-col">
                                            <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest flex items-center gap-2 border-b border-blue-200 pb-2 mb-3">
                                                <MessageSquare className="w-4 h-4"/> Resposta do Gestor
                                            </h4>
                                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{viewingReport.adminComment || viewingReport.closingComment}</p>
                                        </div>
                                    ) : (
                                        <div className="bg-gray-50 border border-dashed border-gray-300 p-6 rounded-xl h-full flex flex-col items-center justify-center text-center">
                                            <Clock className="w-8 h-8 text-gray-300 mb-2" />
                                            <span className="text-xs font-bold text-gray-500 uppercase">Aguardando Avaliação</span>
                                            <p className="text-xs text-gray-400 mt-1">O gestor ainda não adicionou nenhum comentário a este ticket.</p>
                                        </div>
                                    )
                                )}
                            </div>

                        </div>
                        <div className="p-4 bg-gray-50 border-t border-gray-200">
                            <button onClick={() => setViewingReport(null)} className="w-full py-3 bg-gray-200 text-gray-800 rounded-lg font-bold hover:bg-gray-300 transition-colors">Fechar Detalhes</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE DELEÇÃO */}
            {deletingReport && (
                <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[90] backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-6 animate-in zoom-in-95">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle className="w-8 h-8 text-red-600" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Apagar Solicitação?</h3>
                        <p className="text-gray-500 text-sm mb-6">Esta ação não pode ser desfeita. A tarefa será removida permanentemente.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeletingReport(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-bold transition-colors">Cancelar</button>
                            <button onClick={handleDelete} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors">Sim, Apagar</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Reports;