import React, { useState, useEffect } from 'react';
import { 
    CalendarDays, Plus, Search, Eye, Edit2, Trash2, X, Loader2, 
    AlertTriangle, Star, CheckSquare, Clock, ShieldCheck, MessageSquare, Save, User,
    ThumbsUp, Minus, ThumbsDown, Filter
} from 'lucide-react';
import { collection, onSnapshot, query, doc, addDoc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import ReactMarkdown from 'react-markdown';

const MonthlyEvaluations = () => {
    const { showToast } = useNotification();
    const { currentUser } = useAuth();
    
    const [evaluations, setEvaluations] = useState([]);
    const [collaborators, setCollaborators] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [monthFilter, setMonthFilter] = useState('');
    const [classificationFilter, setClassificationFilter] = useState(''); 

    // Controles de Modais
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewingEval, setViewingEval] = useState(null);
    const [deletingEval, setDeletingEval] = useState(null);
    
    // Formulário
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        colabId: '',
        colabName: '',
        referenceMonth: new Date().toISOString().slice(0, 7), // Formato YYYY-MM
        classification: 'Positiva', 
        performance: '',
        performanceScore: '',
        behavior: '',
        behaviorScore: '',
        punctuality: '',
        punctualityScore: '',
        quality: '',
        qualityScore: '',
        generalComments: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Busca Colaboradores Ativos
        const unsubColabs = onSnapshot(query(collection(db, "collaborators"), orderBy("name")), (snap) => {
            const colabs = [];
            snap.forEach(d => {
                if (d.data().active !== false) colabs.push({ id: d.id, ...d.data() });
            });
            setCollaborators(colabs);
        });

        // Busca Avaliações
        const unsubEvals = onSnapshot(query(collection(db, "monthly_evaluations")), (snap) => {
            const fetchedData = [];
            snap.forEach(doc => fetchedData.push({ id: doc.id, ...doc.data() }));
            
            // Ordena pelas mais recentes (Mês de referência decrescente)
            fetchedData.sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth));
            
            setEvaluations(fetchedData);
            setLoading(false);
        });

        return () => { unsubColabs(); unsubEvals(); };
    }, []);

    // Formata YYYY-MM para MM/YYYY
    const formatMonth = (yyyyMm) => {
        if (!yyyyMm) return '--';
        const [year, month] = yyyyMm.split('-');
        return `${month}/${year}`;
    };

    // --- FILTRAGEM ---
    const filteredEvaluations = evaluations.filter(e => {
        const matchSearch = searchTerm === '' || e.colabName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchMonth = monthFilter === '' || e.referenceMonth === monthFilter;
        const matchClassification = classificationFilter === '' || e.classification === classificationFilter;
        return matchSearch && matchMonth && matchClassification;
    });

    // Extrai meses únicos para o filtro
    const availableMonths = [...new Set(evaluations.map(e => e.referenceMonth))].sort().reverse();

    // --- AÇÕES ---
    const openNewModal = () => {
        setEditingId(null);
        setFormData({
            colabId: '', colabName: '', referenceMonth: new Date().toISOString().slice(0, 7),
            classification: 'Positiva',
            performance: '', performanceScore: '', 
            behavior: '', behaviorScore: '', 
            punctuality: '', punctualityScore: '', 
            quality: '', qualityScore: '', 
            generalComments: ''
        });
        setIsModalOpen(true);
    };

    const openEditModal = (evaluation) => {
        setEditingId(evaluation.id);
        setFormData({
            colabId: evaluation.colabId,
            colabName: evaluation.colabName,
            referenceMonth: evaluation.referenceMonth,
            classification: evaluation.classification || 'Positiva',
            performance: evaluation.performance || '',
            performanceScore: evaluation.performanceScore || '',
            behavior: evaluation.behavior || '',
            behaviorScore: evaluation.behaviorScore || '',
            punctuality: evaluation.punctuality || '',
            punctualityScore: evaluation.punctualityScore || '',
            quality: evaluation.quality || '',
            qualityScore: evaluation.qualityScore || '',
            generalComments: evaluation.generalComments || ''
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.colabId) {
            showToast("Selecione um colaborador.", "error");
            return;
        }

        setSaving(true);
        try {
            // Garante que as notas sejam salvas como números
            const payload = { 
                ...formData, 
                performanceScore: Number(formData.performanceScore),
                behaviorScore: Number(formData.behaviorScore),
                punctualityScore: Number(formData.punctualityScore),
                qualityScore: Number(formData.qualityScore),
                updatedAt: new Date() 
            };

            if (editingId) {
                await updateDoc(doc(db, "monthly_evaluations", editingId), payload);
                showToast("Avaliação atualizada com sucesso!", "success");
            } else {
                payload.evaluatorId = currentUser.firestoreId;
                payload.evaluatorName = currentUser.name;
                payload.createdAt = new Date();
                payload.read = false; // Define como não lida ao criar
                await addDoc(collection(db, "monthly_evaluations"), payload);
                showToast("Avaliação mensal registrada!", "success");
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
            await deleteDoc(doc(db, "monthly_evaluations", deletingEval.id));
            showToast("Avaliação excluída permanentemente.", "success");
            setDeletingEval(null);
        } catch {
            showToast("Erro ao excluir.", "error");
        }
    };

    const handleColabChange = (e) => {
        const id = e.target.value;
        const colab = collaborators.find(c => c.id === id);
        setFormData({ ...formData, colabId: id, colabName: colab ? colab.name : '' });
    };

    // --- UI HELPERS ---
    const getClassificationBadge = (classification) => {
        switch (classification) {
            case 'Positiva': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 flex items-center gap-1 w-max"><ThumbsUp className="w-3 h-3"/> Positiva</span>;
            case 'Neutra': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 flex items-center gap-1 w-max"><Minus className="w-3 h-3"/> Neutra</span>;
            case 'Negativa': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-700 flex items-center gap-1 w-max"><ThumbsDown className="w-3 h-3"/> Negativa</span>;
            default: return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 flex items-center gap-1 w-max"><Minus className="w-3 h-3"/> N/A</span>;
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
                        <CalendarDays className="w-6 h-6 text-red-600" />
                        Avaliações Mensais (1:1)
                    </h1>
                    <p className="text-sm text-gray-500">Registre o feedback consolidado do mês com notas por pilar.</p>
                </div>
                <button 
                    onClick={openNewModal}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors shadow-sm"
                >
                    <Plus className="w-5 h-5" /> Nova Avaliação
                </button>
            </header>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 shrink-0 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                    <input 
                        type="text" 
                        placeholder="Buscar por colaborador..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-sm transition-all"
                    />
                </div>
                
                <div className="w-full md:w-56 relative">
                    <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                    <select 
                        value={classificationFilter}
                        onChange={(e) => setClassificationFilter(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-sm appearance-none bg-white cursor-pointer text-gray-600 font-medium"
                    >
                        <option value="">Todas as Classificações</option>
                        <option value="Positiva">Apenas Positivas</option>
                        <option value="Neutra">Apenas Neutras</option>
                        <option value="Negativa">Apenas Negativas</option>
                    </select>
                </div>

                <div className="w-full md:w-56 relative">
                    <CalendarDays className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                    <select 
                        value={monthFilter}
                        onChange={(e) => setMonthFilter(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-sm appearance-none bg-white cursor-pointer text-gray-600 font-medium"
                    >
                        <option value="">Todos os Meses</option>
                        {availableMonths.map(m => (
                            <option key={m} value={m}>{formatMonth(m)}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                {filteredEvaluations.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                        <CalendarDays className="w-12 h-12 mb-3 opacity-20" />
                        <p className="text-lg font-medium text-gray-500">Nenhuma avaliação encontrada.</p>
                        <p className="text-sm mt-1">Nenhum registro corresponde aos filtros atuais.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto flex-1">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-zinc-950 text-white sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-3 text-left font-semibold w-32">Mês/Ano</th>
                                    <th className="px-6 py-3 text-left font-semibold">Colaborador</th>
                                    <th className="px-6 py-3 text-left font-semibold">Classificação</th>
                                    <th className="px-6 py-3 text-left font-semibold">Leitura</th>
                                    <th className="px-6 py-3 text-left font-semibold">Avaliador</th>
                                    <th className="px-6 py-3 text-right font-semibold">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredEvaluations.map((evaluation) => (
                                    <tr key={evaluation.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded-lg border border-gray-200">
                                                {formatMonth(evaluation.referenceMonth)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-gray-900">
                                            {evaluation.colabName}
                                        </td>
                                        <td className="px-6 py-4">
                                            {getClassificationBadge(evaluation.classification)}
                                        </td>
                                        <td className="px-6 py-4">
                                            {evaluation.read ? (
                                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 flex items-center gap-1 w-max" title="O colaborador já visualizou esta avaliação.">
                                                    <CheckSquare className="w-3 h-3"/> Lido
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 flex items-center gap-1 w-max" title="Aguardando a leitura do colaborador.">
                                                    <Clock className="w-3 h-3"/> Pendente
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 font-medium">
                                            {evaluation.evaluatorName || 'Desconhecido'}
                                        </td>
                                        
                                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                                            <button onClick={() => setViewingEval(evaluation)} className="p-2 text-blue-600 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors border border-transparent hover:border-blue-100" title="Ler Avaliação">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => openEditModal(evaluation)} className="p-2 text-amber-600 hover:bg-amber-50 hover:text-amber-700 rounded-lg transition-colors border border-transparent hover:border-amber-100" title="Editar">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => setDeletingEval(evaluation)} className="p-2 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors border border-transparent hover:border-red-100" title="Excluir">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL DE CRIAÇÃO / EDIÇÃO */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh]">
                        <div className="p-5 bg-zinc-950 text-white flex justify-between items-center shrink-0">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <CalendarDays className="w-5 h-5 text-red-500" />
                                {editingId ? 'Editar Avaliação Mensal' : 'Nova Avaliação Mensal (1:1)'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                            <form id="evalForm" onSubmit={handleSubmit} className="space-y-6">
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Colaborador</label>
                                        <select required value={formData.colabId} onChange={handleColabChange} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none font-medium">
                                            <option value="" disabled>Selecione...</option>
                                            {collaborators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Mês de Referência</label>
                                        <input type="month" required value={formData.referenceMonth} onChange={(e) => setFormData({...formData, referenceMonth: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none font-medium" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Classificação Geral</label>
                                        <select required value={formData.classification} onChange={(e) => setFormData({...formData, classification: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none font-bold">
                                            <option value="Positiva">👍 Positiva</option>
                                            <option value="Neutra">➖ Neutra</option>
                                            <option value="Negativa">👎 Negativa</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Dica de Markdown */}
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex gap-3 items-start text-blue-800 text-sm">
                                    <MessageSquare className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <strong className="block mb-1">Dica de Formatação (Markdown)</strong>
                                        Use <strong>**texto**</strong> para negrito, <strong>*texto*</strong> para itálico, <strong>- item</strong> para criar listas em tópicos. Pule uma linha para separar parágrafos. As notas vão de <strong>1 a 10</strong>.
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    {/* PILAR 1: DESEMPENHO */}
                                    <div className="bg-white p-1 rounded-xl border border-gray-200 shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-red-500 transition-shadow">
                                        <div className="flex justify-between items-center bg-gray-50 p-3 border-b border-gray-100">
                                            <label className="flex items-center gap-2 text-sm font-bold text-gray-800">
                                                <Star className="w-4 h-4 text-amber-500" /> 1. Desempenho e Produtividade
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-gray-500 uppercase">Nota (1 a 10):</span>
                                                <input type="number" min="1" max="10" required value={formData.performanceScore} onChange={(e) => setFormData({...formData, performanceScore: e.target.value})} className="w-16 p-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-amber-500 outline-none font-bold" />
                                            </div>
                                        </div>
                                        <textarea rows="3" placeholder="Análise das métricas, metas batidas, TMA, etc..." value={formData.performance} onChange={(e) => setFormData({...formData, performance: e.target.value})} className="w-full p-3 outline-none resize-y min-h-[80px] text-sm text-gray-700" />
                                    </div>

                                    {/* PILAR 2: QUALIDADE */}
                                    <div className="bg-white p-1 rounded-xl border border-gray-200 shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-red-500 transition-shadow">
                                        <div className="flex justify-between items-center bg-gray-50 p-3 border-b border-gray-100">
                                            <label className="flex items-center gap-2 text-sm font-bold text-gray-800">
                                                <ShieldCheck className="w-4 h-4 text-emerald-500" /> 2. Qualidade e Processos
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-gray-500 uppercase">Nota (1 a 10):</span>
                                                <input type="number" min="1" max="10" required value={formData.qualityScore} onChange={(e) => setFormData({...formData, qualityScore: e.target.value})} className="w-16 p-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 outline-none font-bold" />
                                            </div>
                                        </div>
                                        <textarea rows="3" placeholder="Adesão aos processos, notas de QA, FCR..." value={formData.quality} onChange={(e) => setFormData({...formData, quality: e.target.value})} className="w-full p-3 outline-none resize-y min-h-[80px] text-sm text-gray-700" />
                                    </div>

                                    {/* PILAR 3: COMPORTAMENTO */}
                                    <div className="bg-white p-1 rounded-xl border border-gray-200 shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-red-500 transition-shadow">
                                        <div className="flex justify-between items-center bg-gray-50 p-3 border-b border-gray-100">
                                            <label className="flex items-center gap-2 text-sm font-bold text-gray-800">
                                                <User className="w-4 h-4 text-blue-500" /> 3. Comportamento e Postura
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-gray-500 uppercase">Nota (1 a 10):</span>
                                                <input type="number" min="1" max="10" required value={formData.behaviorScore} onChange={(e) => setFormData({...formData, behaviorScore: e.target.value})} className="w-16 p-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
                                            </div>
                                        </div>
                                        <textarea rows="3" placeholder="Trabalho em equipe, comunicação, proatividade..." value={formData.behavior} onChange={(e) => setFormData({...formData, behavior: e.target.value})} className="w-full p-3 outline-none resize-y min-h-[80px] text-sm text-gray-700" />
                                    </div>

                                    {/* PILAR 4: PONTUALIDADE */}
                                    <div className="bg-white p-1 rounded-xl border border-gray-200 shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-red-500 transition-shadow">
                                        <div className="flex justify-between items-center bg-gray-50 p-3 border-b border-gray-100">
                                            <label className="flex items-center gap-2 text-sm font-bold text-gray-800">
                                                <Clock className="w-4 h-4 text-purple-500" /> 4. Assiduidade e Pontualidade
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-gray-500 uppercase">Nota (1 a 10):</span>
                                                <input type="number" min="1" max="10" required value={formData.punctualityScore} onChange={(e) => setFormData({...formData, punctualityScore: e.target.value})} className="w-16 p-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 outline-none font-bold" />
                                            </div>
                                        </div>
                                        <textarea rows="2" placeholder="Atrasos, faltas, gestão de pausas..." value={formData.punctuality} onChange={(e) => setFormData({...formData, punctuality: e.target.value})} className="w-full p-3 outline-none resize-y min-h-[60px] text-sm text-gray-700" />
                                    </div>

                                    {/* RELATÓRIO COMPLETO / CONSIDERAÇÕES FINAIS */}
                                    <div className="bg-white p-1 rounded-xl border border-gray-200 shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-red-500 transition-shadow">
                                        <label className="flex items-center gap-2 text-sm font-bold text-gray-800 bg-gray-50 p-3 border-b border-gray-100">
                                            <MessageSquare className="w-4 h-4 text-gray-500" /> Relatório Completo do Mês / Considerações Finais
                                        </label>
                                        <textarea rows="8" placeholder="Relatório detalhado do mês, alinhamentos finais e próximos passos..." value={formData.generalComments} onChange={(e) => setFormData({...formData, generalComments: e.target.value})} className="w-full p-3 outline-none resize-y min-h-[150px] text-sm text-gray-700" />
                                    </div>
                                </div>
                            </form>
                        </div>
                        
                        <div className="p-4 bg-white border-t border-gray-200 flex gap-3 shrink-0">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-bold transition-colors">Cancelar</button>
                            <button type="submit" form="evalForm" disabled={saving} className="flex-1 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors disabled:opacity-70 flex justify-center items-center gap-2 shadow-sm">
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                Salvar Avaliação
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE VISUALIZAÇÃO EM FORMATO DE DOCUMENTO */}
            {viewingEval && (
                <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
                    <div className="bg-gray-100 rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                                    <CalendarDays className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-black text-lg text-gray-900 leading-tight">Relatório de Avaliação Mensal</h3>
                                    <p className="text-xs text-gray-500">Mês de Referência: <strong className="text-gray-700">{formatMonth(viewingEval.referenceMonth)}</strong></p>
                                </div>
                            </div>
                            <button onClick={() => setViewingEval(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1">
                            {/* "Página" de Documento */}
                            <div className="bg-white p-8 rounded border border-gray-200 shadow-sm mx-auto max-w-3xl">
                                
                                <div className="border-b-2 border-gray-900 pb-4 mb-6 flex justify-between items-end">
                                    <div>
                                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Colaborador Avaliado</span>
                                        <span className="text-2xl font-black text-gray-900 flex items-center gap-3">
                                            {viewingEval.colabName}
                                            {getClassificationBadge(viewingEval.classification)}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Avaliador Responsável</span>
                                        <span className="text-base font-bold text-gray-700">{viewingEval.evaluatorName}</span>
                                    </div>
                                </div>

                                <div className="space-y-8 markdown-body">
                                    {/* PILAR 1 */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                                <Star className="w-4 h-4 text-amber-500"/> Desempenho e Produtividade
                                            </h4>
                                            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">Nota: <strong className="text-gray-900 text-sm">{viewingEval.performanceScore || '-'}</strong>/10</span>
                                        </div>
                                        <div className="text-gray-800 text-sm prose prose-sm max-w-none">
                                            <ReactMarkdown>{viewingEval.performance || '*Sem observações neste pilar.*'}</ReactMarkdown>
                                        </div>
                                    </div>

                                    {/* PILAR 2 */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                                <ShieldCheck className="w-4 h-4 text-emerald-500"/> Qualidade e Processos
                                            </h4>
                                            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">Nota: <strong className="text-gray-900 text-sm">{viewingEval.qualityScore || '-'}</strong>/10</span>
                                        </div>
                                        <div className="text-gray-800 text-sm prose prose-sm max-w-none">
                                            <ReactMarkdown>{viewingEval.quality || '*Sem observações neste pilar.*'}</ReactMarkdown>
                                        </div>
                                    </div>

                                    {/* PILAR 3 */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                                <User className="w-4 h-4 text-blue-500"/> Comportamento e Postura
                                            </h4>
                                            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">Nota: <strong className="text-gray-900 text-sm">{viewingEval.behaviorScore || '-'}</strong>/10</span>
                                        </div>
                                        <div className="text-gray-800 text-sm prose prose-sm max-w-none">
                                            <ReactMarkdown>{viewingEval.behavior || '*Sem observações neste pilar.*'}</ReactMarkdown>
                                        </div>
                                    </div>

                                    {/* PILAR 4 */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-purple-500"/> Assiduidade e Pontualidade
                                            </h4>
                                            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">Nota: <strong className="text-gray-900 text-sm">{viewingEval.punctualityScore || '-'}</strong>/10</span>
                                        </div>
                                        <div className="text-gray-800 text-sm prose prose-sm max-w-none">
                                            <ReactMarkdown>{viewingEval.punctuality || '*Sem observações neste pilar.*'}</ReactMarkdown>
                                        </div>
                                    </div>

                                    {/* CONSIDERAÇÕES FINAIS */}
                                    {viewingEval.generalComments && (
                                        <div className="space-y-2 pt-4 mt-6 border-t-2 border-gray-100">
                                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                                <MessageSquare className="w-4 h-4 text-gray-500"/> Relatório Completo do Mês / Considerações Finais
                                            </h4>
                                            <div className="text-gray-800 text-sm prose prose-sm max-w-none bg-gray-50 p-4 rounded-lg border border-gray-200">
                                                <ReactMarkdown>{viewingEval.generalComments}</ReactMarkdown>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-4 bg-white border-t border-gray-200 flex justify-end shrink-0">
                            <button onClick={() => setViewingEval(null)} className="px-8 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-black transition-colors">Fechar Documento</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE DELEÇÃO */}
            {deletingEval && (
                <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[90] backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-6 animate-in zoom-in-95">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle className="w-8 h-8 text-red-600" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Apagar Avaliação?</h3>
                        <p className="text-gray-500 text-sm mb-6">Esta ação não pode ser desfeita. O histórico do colaborador será perdido.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeletingEval(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-bold transition-colors">Cancelar</button>
                            <button onClick={handleDelete} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors">Sim, Apagar</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default MonthlyEvaluations;