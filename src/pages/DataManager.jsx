import React, { useState, useEffect } from 'react';
import { Database, Search, Calendar, Eye, Edit2, Trash2, X, Loader2, MessageSquare, TrendingUp, Target, AlertTriangle, ShieldCheck } from 'lucide-react';
import { collection, onSnapshot, query, doc, deleteDoc, updateDoc } from 'firebase/firestore';
const collectionMap = {
    "feedbacks": "feedbacks",
    "metrics": "weekly_evaluations",
    "kpis": "sector_kpis",
    "audits": "qa_audits"
};
import { db } from '../services/firebase';
import { useNotification } from '../context/NotificationContext';

// --- DICIONÁRIO DE TRADUÇÃO (BANCO DE DADOS -> TELA) ---
const translateKey = (key) => {
    const dictionary = {
        createdBy: 'Criado por',
        collaboratorId: 'Colaborador',
        colabId: 'Colaborador',
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
        evaluatorName: 'Avaliador',
        evaluatorId: 'ID Avaliador',
        notes: 'Observações do Auditor',
        status: 'Status'
    };
    return dictionary[key] || key;
};

const DataManager = () => {
    const { showToast } = useNotification();
    
    // Adicionado a aba 'audits'
    const [activeTab, setActiveTab] = useState('feedbacks'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [collaboratorsMap, setCollaboratorsMap] = useState({});
    const [qaProcesses, setQaProcesses] = useState({});
    
    const [viewingItem, setViewingItem] = useState(null);
    const [editingItem, setEditingItem] = useState(null);
    const [deletingItem, setDeletingItem] = useState(null);

    // Mapeamento atualizado das coleções

    const getSafeDateString = (item) => {
        if (item.date) {
            if (typeof item.date === 'string' && item.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const [year, month, day] = item.date.split('-');
                return `${day}/${month}/${year}`;
            }
            return item.date;
        }
        if (item.createdAt) {
            if (typeof item.createdAt.toDate === 'function') {
                return new Date(item.createdAt.toDate()).toLocaleDateString('pt-BR');
            }
            try {
                return new Date(item.createdAt).toLocaleDateString('pt-BR');
            } catch {
                return 'Data inválida';
            }
        }
        return 'Sem data';
    };

    useEffect(() => {
        const unsubColabs = onSnapshot(collection(db, "collaborators"), (snapshot) => {
            const map = {};
            snapshot.forEach((doc) => {
                map[doc.id] = doc.data().name;
            });
            setCollaboratorsMap(map);
        });
        
        const unsubQA = onSnapshot(collection(db, "qa_processes"), (snapshot) => {
            const map = {};
            snapshot.forEach((doc) => {
                map[doc.id] = doc.data();
            });
            setQaProcesses(map);
        });

        return () => {
            unsubColabs();
            unsubQA();
        };
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        const currentCollection = collectionMap[activeTab];
        const q = query(collection(db, currentCollection)); 
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedData = [];
            snapshot.forEach((doc) => {
                fetchedData.push({ id: doc.id, ...doc.data() });
            });
            
            fetchedData.sort((a, b) => {
                const getDateValue = (item) => {
                    if (item.date) {
                        if (typeof item.date === 'string' && item.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            return new Date(item.date).getTime();
                        }
                    }
                    if (item.createdAt && typeof item.createdAt.toMillis === 'function') {
                        return item.createdAt.toMillis();
                    }
                    if (item.createdAt) {
                        return new Date(item.createdAt).getTime();
                    }
                    return 0;
                };
                return getDateValue(b) - getDateValue(a);
            });
            
            setData(fetchedData);
            setLoading(false);
        }, (error) => {
            showToast("Erro ao carregar dados: " + error.message, "error");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [activeTab, showToast]);

    const filteredData = data.filter(item => {
        const mappedName = collaboratorsMap[item.colabId || item.collaboratorId] || '';
        
        const matchSearch = searchTerm === '' || 
            (item.colabName && item.colabName.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (mappedName.toLowerCase().includes(searchTerm.toLowerCase())) || 
            (item.type && item.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (activeTab === 'audits' && item.protocol && item.protocol.toLowerCase().includes(searchTerm.toLowerCase()));
            
        const safeDate = getSafeDateString(item);
        const matchDate = dateFilter === '' || safeDate.includes(dateFilter);
            
        return matchSearch && matchDate;
    });

    const handleDelete = async () => {
        try {
            await deleteDoc(doc(db, collectionMap[activeTab], deletingItem.id));
            showToast("Registro apagado com sucesso!", "success");
            setDeletingItem(null);
        } catch (error) {
            showToast("Erro ao apagar: " + error.message, "error");
        }
    };

    const handleEditSave = async (updatedData) => {
        try {
            const docRef = doc(db, collectionMap[activeTab], editingItem.id);
            await updateDoc(docRef, updatedData);
            showToast("Registro atualizado com sucesso!", "success");
            setEditingItem(null);
        } catch (error) {
            showToast("Erro ao atualizar: " + error.message, "error");
        }
    };

    return (
        <div className="flex-1 p-6 bg-gray-50 h-full overflow-y-auto flex flex-col">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Database className="w-6 h-6 text-red-600" />
                        Gerenciador de Dados
                    </h1>
                    <p className="text-sm text-gray-500">Auditoria, edição e exclusão de registros do sistema.</p>
                </div>
            </header>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 shrink-0 space-y-4">
                <div className="flex space-x-2 border-b border-gray-100 pb-4 overflow-x-auto">
                    <TabButton active={activeTab === 'feedbacks'} onClick={() => setActiveTab('feedbacks')} icon={<MessageSquare className="w-4 h-4"/>} text="Feedbacks" />
                    <TabButton active={activeTab === 'metrics'} onClick={() => setActiveTab('metrics')} icon={<TrendingUp className="w-4 h-4"/>} text="Desempenho" />
                    <TabButton active={activeTab === 'kpis'} onClick={() => setActiveTab('kpis')} icon={<Target className="w-4 h-4"/>} text="KPIs do Setor" />
                    <TabButton active={activeTab === 'audits'} onClick={() => setActiveTab('audits')} icon={<ShieldCheck className="w-4 h-4"/>} text="Auditorias QA" />
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                        <input 
                            type="text" 
                            placeholder={activeTab === 'kpis' ? "Busca desativada para KPIs globais..." : "Buscar por colaborador, tipo, ou protocolo..."}
                            disabled={activeTab === 'kpis'}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none disabled:bg-gray-100"
                        />
                    </div>
                    <div className="md:w-64 relative">
                        <Calendar className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                        <input 
                            type="text" 
                            placeholder="Filtrar data (ex: 13/04)"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
                    </div>
                ) : filteredData.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                        <Database className="w-12 h-12 mb-3 opacity-20" />
                        <p className="text-lg font-medium text-gray-500">Nenhum registro encontrado.</p>
                        <p className="text-sm">Tente ajustar os filtros de busca.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto flex-1">
                        <table className="min-w-full divide-y divide-gray-200 text-sm whitespace-nowrap">
                            <thead className="bg-zinc-950 text-white sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-3 text-left font-semibold">Data / Registro</th>
                                    {activeTab !== 'kpis' && <th className="px-6 py-3 text-left font-semibold">Colaborador</th>}
                                    <th className="px-6 py-3 text-left font-semibold">Resumo do Dado</th>
                                    <th className="px-6 py-3 text-right font-semibold">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredData.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-gray-500">
                                            {getSafeDateString(item)}
                                        </td>
                                        
                                        {activeTab !== 'kpis' && (
                                            <td className="px-6 py-4 font-bold text-gray-900 truncate max-w-[250px]">
                                                {collaboratorsMap[item.colabId || item.collaboratorId] || item.colabName || item.colabId || item.collaboratorId || 'Desconhecido'}
                                            </td>
                                        )}

                                        <td className="px-6 py-4">
                                            {activeTab === 'feedbacks' && (
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                                    item.type === 'Elogio' ? 'bg-emerald-100 text-emerald-700' : 
                                                    item.type === 'Ponto de Melhoria' ? 'bg-amber-100 text-amber-700' : 
                                                    'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {item.type}
                                                </span>
                                            )}
                                            {activeTab === 'metrics' && (
                                                <span className="text-gray-600">
                                                    Finalizados: <strong className="text-gray-900">{item.Atendimentos_Finalizados || 0}</strong> | Huggy: <strong className="text-gray-900">{item.Atendimentos_Huggy || 0}</strong>
                                                </span>
                                            )}
                                            {activeTab === 'kpis' && (
                                                <span className="text-gray-600">
                                                    FCR: <strong className="text-gray-900">{item.fcr}%</strong> | TMR: <strong className="text-gray-900">{item.tmr}</strong> | Reincidência: <strong className="text-gray-900">{item.recurrence}%</strong>
                                                </span>
                                            )}
                                            {activeTab === 'audits' && (
                                                <span className="text-gray-600">
                                                    Status: <strong className={item.status === 'Conforme' ? 'text-emerald-600' : 'text-red-600'}>{item.status}</strong> | Protocolo: <strong className="text-gray-900">{item.protocol || '--'}</strong>
                                                </span>
                                            )}
                                        </td>
                                        
                                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                                            <button onClick={() => setViewingItem(item)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Ver detalhes">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => setEditingItem(item)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="Editar">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => setDeletingItem(item)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Excluir">
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

            {viewingItem && <ViewModal activeTab={activeTab} collaboratorsMap={collaboratorsMap} qaProcesses={qaProcesses} item={viewingItem} onClose={() => setViewingItem(null)} />}
            {deletingItem && <DeleteModal onClose={() => setDeletingItem(null)} onConfirm={handleDelete} />}
            {editingItem && <EditModal activeTab={activeTab} item={editingItem} onClose={() => setEditingItem(null)} onSave={handleEditSave} />}
        </div>
    );
};

const TabButton = ({ active, onClick, icon, text }) => (
    <button 
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
            active ? 'bg-red-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
        }`}
    >
        {icon}
        {text}
    </button>
);
const ViewModal = ({ activeTab, item, collaboratorsMap, qaProcesses, onClose }) => {
    return (
        <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
            <div className={`bg-white rounded-xl shadow-2xl w-full ${activeTab === 'audits' ? 'max-w-2xl' : 'max-w-md'} overflow-hidden flex flex-col max-h-[90vh]`}>
                <div className="p-4 bg-zinc-950 text-white flex justify-between items-center shrink-0">
                    <h3 className="font-bold">Detalhes do Registro</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                </div>
                <div className="p-6 space-y-4 text-sm overflow-y-auto flex-1">
                    {Object.entries(item).map(([key, value]) => {
                        if (['id', 'createdAt', 'updatedAt', 'colabId', 'collaboratorId', 'colabName', 'read', 'evaluatorId', 'checklistResults', 'processId'].includes(key)) return null;
                        
                        let displayValue = value;
                        if (value && typeof value === 'object') {
                            if (typeof value.toDate === 'function') {
                                displayValue = value.toDate().toLocaleString('pt-BR');
                            } else if (value.seconds !== undefined) {
                                displayValue = new Date(value.seconds * 1000).toLocaleString('pt-BR');
                            } else {
                                displayValue = JSON.stringify(value);
                            }
                        }
                        
                        let displayString = displayValue?.toString() || 'Vazio';
                        if ((key === 'colabId' || key === 'collaboratorId') && collaboratorsMap && collaboratorsMap[value]) {
                            displayString = collaboratorsMap[value]; 
                        }
                        
                        return (
                            <div key={key} className="border-b border-gray-100 pb-2">
                                <span className="block text-xs font-bold text-gray-400 uppercase">{translateKey(key)}</span>
                                <span className="block text-gray-900 mt-1 whitespace-pre-wrap">{displayString}</span>
                            </div>
                        );
                    })}
                    
                    {/* EXIBIÇÃO DEDICADA DA CHECKLIST DE AUDITORIA */}
                    {activeTab === 'audits' && item.checklistResults && Object.keys(item.checklistResults).length > 0 && (
                        <div className="mt-6 border-t border-gray-200 pt-4">
                            <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-red-500" /> Checklist da Avaliação
                            </h4>
                            <div className="space-y-3">
                                {Object.entries(item.checklistResults).map(([idx, status]) => {
                                    const process = qaProcesses && item.processId ? qaProcesses[item.processId] : null;
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
                    <button onClick={onClose} className="w-full py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300">Fechar</button>
                </div>
            </div>
        </div>
    );
};

const DeleteModal = ({ onClose, onConfirm }) => (
    <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Apagar Registro?</h3>
            <p className="text-gray-500 text-sm mb-6">Esta ação não pode ser desfeita. O dado será removido permanentemente dos relatórios e gráficos.</p>
            <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium">Cancelar</button>
                <button onClick={onConfirm} className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Sim, Apagar</button>
            </div>
        </div>
    </div>
);

const EditModal = ({ activeTab, item, onClose, onSave }) => {
    const [formData, setFormData] = useState({ ...item });

    const handleChange = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const dataToUpdate = { ...formData };
        delete dataToUpdate.id;
        delete dataToUpdate.createdAt; 
        onSave(dataToUpdate);
    };

    return (
        <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 bg-zinc-950 text-white flex justify-between items-center shrink-0">
                    <h3 className="font-bold flex items-center gap-2">
                        <Edit2 className="w-4 h-4 text-amber-500" />
                        Editar Registro
                    </h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1">
                    <form id="editForm" onSubmit={handleSubmit} className="space-y-4">
                        {Object.entries(formData).map(([key, value]) => {
                            if (key === 'id' || key === 'createdAt' || key === 'colabId' || key === 'collaboratorId') return null;
                            
                            // LISTA SUSPENSA PARA MEIO/CANAL
                            if (key === 'method') {
                                return (
                                    <div key={key}>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{translateKey(key)}</label>
                                        <select 
                                            value={value} 
                                            onChange={(e) => handleChange(key, e.target.value)}
                                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                                        >
                                            <option value="Chat">Chat</option>
                                            <option value="Telefone">Telefone</option>
                                            <option value="WhatsApp">WhatsApp</option>
                                            <option value="E-mail">E-mail</option>
                                            <option value="Presencial">Presencial</option>
                                            <option value="Videoconferência">Videoconferência</option>
                                        </select>
                                    </div>
                                );
                            }

                            // LISTA SUSPENSA PARA TIPO DE FEEDBACK
                            if (key === 'type') {
                                return (
                                    <div key={key}>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{translateKey(key)}</label>
                                        <select 
                                            value={value} 
                                            onChange={(e) => handleChange(key, e.target.value)}
                                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                                        >
                                            <option value="Elogio">Elogio</option>
                                            <option value="Ponto de Melhoria">Ponto de Melhoria</option>
                                            <option value="Reclamação">Reclamação</option>
                                            <option value="Sugestão">Sugestão</option>
                                            <option value="Dúvida">Dúvida</option>
                                        </select>
                                    </div>
                                );
                            }

                            // LISTA SUSPENSA PARA STATUS DA AUDITORIA
                            if (key === 'status' && activeTab === 'audits') {
                                return (
                                    <div key={key}>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{translateKey(key)}</label>
                                        <select 
                                            value={value} 
                                            onChange={(e) => handleChange(key, e.target.value)}
                                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                                        >
                                            <option value="Conforme">Conforme</option>
                                            <option value="Não Conforme">Não Conforme</option>
                                        </select>
                                    </div>
                                );
                            }

                            if (key === 'comment' || key === 'notes' || key === 'comentario') {
                                return (
                                    <div key={key}>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{translateKey(key)}</label>
                                        <textarea 
                                            rows="3"
                                            value={value} 
                                            onChange={(e) => handleChange(key, e.target.value)}
                                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none"
                                        />
                                    </div>
                                )
                            }

                            return (
                                <div key={key}>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{translateKey(key)}</label>
                                    <input 
                                        type={typeof value === 'number' ? 'number' : 'text'}
                                        value={value} 
                                        onChange={(e) => handleChange(key, typeof value === 'number' ? Number(e.target.value) : e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none disabled:bg-gray-100"
                                        disabled={key === 'createdBy' || key === 'evaluatorName' || key === 'evaluatorId'}
                                    />
                                </div>
                            );
                        })}
                    </form>
                </div>
                
                <div className="p-4 bg-gray-50 border-t border-gray-200 flex gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-white font-medium transition-colors">Cancelar</button>
                    <button type="submit" form="editForm" className="flex-1 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium transition-colors">Salvar Edição</button>
                </div>
            </div>
        </div>
    );
};

export default DataManager;