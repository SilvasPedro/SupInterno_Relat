import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Target, ShieldCheck, Plus, Trash2, Edit2, X, Loader2, Save } from 'lucide-react';
import { collection, doc, onSnapshot, updateDoc, setDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useNotification } from '../context/NotificationContext';

const Settings = () => {
    const { showToast } = useNotification();
    const [activeTab, setActiveTab] = useState('goals');

    // Estado das Metas
    const [goals, setGoals] = useState({ tmr: '00:20:00', fcr: 80, recurrence: 20 });
    const [savingGoals, setSavingGoals] = useState(false);

    // Estado dos Processos QA
    const [processes, setProcesses] = useState([]);
    const [loadingProcesses, setLoadingProcesses] = useState(true);
    const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
    
    // Formulário do Processo QA
    const [editingProcessId, setEditingProcessId] = useState(null);
    const [processName, setProcessName] = useState('');
    const [checklistItems, setChecklistItems] = useState(['']);
    const [savingProcess, setSavingProcess] = useState(false);

    useEffect(() => {
        // Listener de Metas
        const unsubGoals = onSnapshot(doc(db, "system_settings", "sector_goals"), (docSnap) => {
            if (docSnap.exists()) setGoals(docSnap.data());
        });

        // Listener de Processos QA
        const unsubProcesses = onSnapshot(collection(db, "qa_processes"), (snap) => {
            const fetched = [];
            snap.forEach(d => fetched.push({ id: d.id, ...d.data() }));
            fetched.sort((a, b) => a.name.localeCompare(b.name));
            setProcesses(fetched);
            setLoadingProcesses(false);
        });

        return () => { unsubGoals(); unsubProcesses(); };
    }, []);

    // --- SALVAR METAS ---
    const handleSaveGoals = async (e) => {
        e.preventDefault();
        setSavingGoals(true);
        try {
            await setDoc(doc(db, "system_settings", "sector_goals"), goals);
            showToast("Metas atualizadas com sucesso!", "success");
        } catch {
            showToast("Erro ao atualizar metas.", "error");
        } finally {
            setSavingGoals(false);
        }
    };

    // --- GERENCIAMENTO DE PROCESSOS QA ---
    const openProcessModal = (proc = null) => {
        if (proc) {
            setEditingProcessId(proc.id);
            setProcessName(proc.name);
            setChecklistItems(proc.checklist && proc.checklist.length > 0 ? proc.checklist : ['']);
        } else {
            setEditingProcessId(null);
            setProcessName('');
            setChecklistItems(['']);
        }
        setIsProcessModalOpen(true);
    };

    const handleAddChecklistItem = () => {
        setChecklistItems([...checklistItems, '']);
    };

    const handleRemoveChecklistItem = (index) => {
        const newItems = [...checklistItems];
        newItems.splice(index, 1);
        if (newItems.length === 0) newItems.push(''); // Garante pelo menos um campo
        setChecklistItems(newItems);
    };

    const handleChecklistItemChange = (index, value) => {
        const newItems = [...checklistItems];
        newItems[index] = value;
        setChecklistItems(newItems);
    };

    const handleSaveProcess = async (e) => {
        e.preventDefault();
        // Filtra itens vazios
        const validChecklist = checklistItems.map(i => i.trim()).filter(i => i !== '');
        
        if (!processName.trim()) {
            showToast("O nome do processo é obrigatório.", "error");
            return;
        }
        if (validChecklist.length === 0) {
            showToast("Adicione pelo menos um item válido na checklist.", "error");
            return;
        }

        setSavingProcess(true);
        try {
            const payload = { name: processName.trim(), checklist: validChecklist };
            
            if (editingProcessId) {
                await updateDoc(doc(db, "qa_processes", editingProcessId), payload);
                showToast("Processo atualizado!", "success");
            } else {
                await addDoc(collection(db, "qa_processes"), payload);
                showToast("Novo processo criado!", "success");
            }
            setIsProcessModalOpen(false);
        } catch {
            showToast("Erro ao salvar processo.", "error");
        } finally {
            setSavingProcess(false);
        }
    };

    const handleDeleteProcess = async (id) => {
        if (!window.confirm("Deseja realmente apagar este processo? As auditorias antigas não serão afetadas, mas ele não aparecerá mais para novas avaliações.")) return;
        try {
            await deleteDoc(doc(db, "qa_processes", id));
            showToast("Processo apagado.", "success");
        } catch {
            showToast("Erro ao apagar.", "error");
        }
    };

    return (
        <div className="flex-1 p-6 h-full overflow-y-auto bg-gray-50 flex flex-col">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <SettingsIcon className="w-6 h-6 text-red-600" /> Configurações do Sistema
                    </h1>
                    <p className="text-sm text-gray-500">Ajuste de metas e padronização de processos.</p>
                </div>
            </header>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 shrink-0 flex space-x-2 overflow-x-auto">
                <button onClick={() => setActiveTab('goals')} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'goals' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                    <Target className="w-4 h-4"/> Metas Globais
                </button>
                <button onClick={() => setActiveTab('qa')} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'qa' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                    <ShieldCheck className="w-4 h-4"/> Processos QA & Checklists
                </button>
            </div>

            {activeTab === 'goals' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-2xl">
                    <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2"><Target className="w-5 h-5 text-red-500"/> Metas do Setor</h2>
                    <form onSubmit={handleSaveGoals} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Meta TMR (hh:mm:ss)</label>
                                <input type="step" step="1" required value={goals.tmr} onChange={(e) => setGoals({...goals, tmr: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Meta FCR (%)</label>
                                <input type="number" required value={goals.fcr} onChange={(e) => setGoals({...goals, fcr: Number(e.target.value)})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Taxa de Reincidência (%)</label>
                                <input type="number" required value={goals.recurrence} onChange={(e) => setGoals({...goals, recurrence: Number(e.target.value)})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none" />
                            </div>
                        </div>
                        <button type="submit" disabled={savingGoals} className="py-2.5 px-6 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors disabled:opacity-70 flex items-center gap-2">
                            {savingGoals ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Salvar Metas
                        </button>
                    </form>
                </div>
            )}

            {activeTab === 'qa' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col flex-1 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">Processos Auditáveis (Checklists)</h2>
                        <button onClick={() => openProcessModal()} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 font-bold transition-colors">
                            <Plus className="w-4 h-4" /> Novo Processo
                        </button>
                    </div>
                    
                    <div className="overflow-y-auto flex-1 p-4">
                        {loadingProcesses ? (
                            <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>
                        ) : processes.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>Nenhum processo cadastrado. Crie o primeiro para habilitar as checklists na Auditoria.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {processes.map(proc => (
                                    <div key={proc.id} className="border border-gray-200 rounded-xl p-4 flex flex-col hover:border-red-200 transition-colors shadow-sm">
                                        <div className="flex justify-between items-start mb-3">
                                            <h3 className="font-bold text-gray-900 line-clamp-1">{proc.name}</h3>
                                            <div className="flex gap-1">
                                                <button onClick={() => openProcessModal(proc)} className="p-1 text-gray-400 hover:text-amber-500 rounded"><Edit2 className="w-4 h-4"/></button>
                                                <button onClick={() => handleDeleteProcess(proc.id)} className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-4 h-4"/></button>
                                            </div>
                                        </div>
                                        <div className="flex-1 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1 overflow-hidden">
                                            <span className="font-bold text-gray-500 block mb-2 uppercase tracking-wider">{proc.checklist?.length || 0} Itens de Verificação:</span>
                                            {proc.checklist?.slice(0, 4).map((item, idx) => (
                                                <div key={idx} className="flex gap-1 items-start"><span className="text-red-500 font-bold">•</span><span className="line-clamp-1">{item}</span></div>
                                            ))}
                                            {proc.checklist?.length > 4 && <div className="text-gray-400 pt-1 italic">+ {proc.checklist.length - 4} itens...</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isProcessModalOpen && (
                <div className="fixed inset-0 bg-zinc-950/70 flex items-center justify-center p-4 z-[80] backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 bg-zinc-950 text-white flex justify-between items-center shrink-0">
                            <h3 className="font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-red-500" /> {editingProcessId ? 'Editar Processo' : 'Novo Processo de QA'}</h3>
                            <button onClick={() => setIsProcessModalOpen(false)}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                            <form id="processForm" onSubmit={handleSaveProcess} className="space-y-6">
                                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Processo (Ex: Sem Acesso, Lentidão)</label>
                                    <input type="text" required value={processName} onChange={(e) => setProcessName(e.target.value)} placeholder="Título do procedimento..." className="w-full p-2.5 text-lg font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none" />
                                </div>

                                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                    <div className="flex justify-between items-center mb-4">
                                        <label className="block text-xs font-bold text-gray-500 uppercase">Itens da Checklist</label>
                                        <button type="button" onClick={handleAddChecklistItem} className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded hover:bg-red-100 flex items-center gap-1"><Plus className="w-3 h-3"/> Adicionar Pergunta</button>
                                    </div>
                                    
                                    <div className="space-y-3">
                                        {checklistItems.map((item, index) => (
                                            <div key={index} className="flex gap-2 items-start">
                                                <div className="w-6 h-8 flex items-center justify-center font-bold text-gray-400 text-sm pt-1">{index + 1}.</div>
                                                <textarea 
                                                    rows="2" 
                                                    value={item} 
                                                    onChange={(e) => handleChecklistItemChange(index, e.target.value)} 
                                                    placeholder="Ex: O colaborador verificou o status da OLT antes de prosseguir?"
                                                    className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-sm resize-none"
                                                />
                                                <button type="button" onClick={() => handleRemoveChecklistItem(index)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg mt-1"><Trash2 className="w-4 h-4"/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </form>
                        </div>
                        
                        <div className="p-4 bg-white border-t border-gray-200 flex gap-3 shrink-0">
                            <button type="button" onClick={() => setIsProcessModalOpen(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors">Cancelar</button>
                            <button type="submit" form="processForm" disabled={savingProcess} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors disabled:opacity-70 flex items-center justify-center gap-2">
                                {savingProcess ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Salvar Processo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;