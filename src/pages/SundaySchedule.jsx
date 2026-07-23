import React, { useState, useEffect } from 'react';
import { 
    CalendarDays, ChevronLeft, ChevronRight, Save, 
    Loader2, Users, GripVertical, X
} from 'lucide-react';
import { collection, onSnapshot, query, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useNotification } from '../context/NotificationContext';

const getSundaysInMonth = (year, month) => {
    const sundays = [];
    const date = new Date(year, month, 1);
    while (date.getDay() !== 0) {
        date.setDate(date.getDate() + 1);
    }
    while (date.getMonth() === month) {
        sundays.push(new Date(date));
        date.setDate(date.getDate() + 7);
    }
    return sundays;
};

const formatDateString = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Recebe a propriedade readOnly para definir se é visão de gestor ou colaborador
const SundaySchedule = ({ readOnly = false }) => {
    const { showToast } = useNotification();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [collaborators, setCollaborators] = useState([]);
    const [schedule, setSchedule] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [draggedItem, setDraggedItem] = useState(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const sundays = getSundaysInMonth(year, month);
    const documentId = `${year}-${String(month + 1).padStart(2, '0')}`;

    useEffect(() => {
        // A busca de colaboradores só é estritamente necessária se for edição, 
        // mas mantemos para garantir que a lista de disponíveis esteja atualizada.
        if (!readOnly) {
            const qColabs = query(collection(db, "collaborators"));
            const unsubColabs = onSnapshot(qColabs, (snap) => {
                const colabs = [];
                snap.forEach(d => {
                    if (d.data().active !== false) {
                        colabs.push({ id: d.id, ...d.data() });
                    }
                });
                colabs.sort((a, b) => a.name.localeCompare(b.name));
                setCollaborators(colabs);
            });
            return () => unsubColabs();
        }
    }, [readOnly]);

    useEffect(() => {
        const fetchSchedule = async () => {
            setLoading(true);
            try {
                const docRef = doc(db, "sunday_schedules", documentId);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    setSchedule(docSnap.data().assignments || {});
                } else {
                    setSchedule({});
                }
            } catch {
                showToast("Erro ao carregar a escala.", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchSchedule();
    }, [documentId, showToast]);

    const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    const handleSave = async () => {
        if (readOnly) return;
        setSaving(true);
        try {
            await setDoc(doc(db, "sunday_schedules", documentId), {
                month: documentId,
                assignments: schedule,
                updatedAt: new Date()
            });
            showToast("Escala salva com sucesso!", "success");
        } catch {
            showToast("Erro ao salvar escala.", "error");
        } finally {
            setSaving(false);
        }
    };

    // Lógica Drag & Drop (desativada se readOnly for true)
    const handleDragStart = (e, colab, sourceDate) => {
        if (readOnly) return;
        setDraggedItem({ colab, sourceDate });
        e.dataTransfer.effectAllowed = "move";
        setTimeout(() => { e.target.style.opacity = '0.5'; }, 0);
    };

    const handleDragEnd = (e) => {
        if (readOnly) return;
        e.target.style.opacity = '1';
        setDraggedItem(null);
    };

    const handleDragOver = (e) => {
        if (readOnly) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e, targetDate) => {
        if (readOnly) return;
        e.preventDefault();
        if (!draggedItem) return;

        const { colab, sourceDate } = draggedItem;
        if (sourceDate === targetDate) return;

        setSchedule((prev) => {
            const newSchedule = { ...prev };
            if (targetDate === null && sourceDate !== null) {
                newSchedule[sourceDate] = newSchedule[sourceDate].filter(c => c.id !== colab.id);
                return newSchedule;
            }
            if (targetDate !== null) {
                if (!newSchedule[targetDate]) newSchedule[targetDate] = [];
                if (newSchedule[targetDate].some(c => c.id === colab.id)) {
                    showToast(`${colab.name} já está na escala deste dia.`, "error");
                    return prev;
                }
                newSchedule[targetDate].push(colab);
                if (sourceDate !== null) {
                    newSchedule[sourceDate] = newSchedule[sourceDate].filter(c => c.id !== colab.id);
                }
            }
            return newSchedule;
        });
    };

    const removeColab = (dateString, colabId) => {
        if (readOnly) return;
        setSchedule(prev => {
            const newSchedule = { ...prev };
            newSchedule[dateString] = newSchedule[dateString].filter(c => c.id !== colabId);
            return newSchedule;
        });
    };

    const monthName = currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    if (loading && collaborators.length === 0) {
        return <div className="flex-1 flex items-center justify-center bg-gray-50 h-full"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>;
    }

    return (
        <div className="flex-1 p-6 h-full overflow-y-auto bg-gray-50 flex flex-col">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <CalendarDays className="w-6 h-6 text-red-600" />
                        Escala de Plantão (Domingos)
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {readOnly ? "Consulte a escala de plantões programada para a equipe." : "Arraste os colaboradores para os domingos desejados e monte a escala."}
                    </p>
                </div>
                
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200">
                        <button onClick={handlePrevMonth} className="p-2 hover:bg-white rounded-md transition-colors text-gray-600">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="w-40 text-center font-bold text-gray-800 capitalize">
                            {monthName}
                        </span>
                        <button onClick={handleNextMonth} className="p-2 hover:bg-white rounded-md transition-colors text-gray-600">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    {!readOnly && (
                        <button 
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors disabled:opacity-70 shadow-sm"
                        >
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            Salvar Escala
                        </button>
                    )}
                </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                {/* LADO ESQUERDO: Colaboradores Disponíveis (Oculto no ReadOnly) */}
                {!readOnly && (
                    <div 
                        className="w-full lg:w-72 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden shrink-0"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, null)}
                    >
                        <div className="p-4 border-b border-gray-100 bg-zinc-950 text-white flex items-center gap-2">
                            <Users className="w-5 h-5 text-red-500" />
                            <h3 className="font-bold">Equipe Ativa</h3>
                        </div>
                        
                        <div className="p-3 overflow-y-auto flex-1 space-y-2 bg-gray-50">
                            <p className="text-xs text-gray-500 mb-3 text-center">
                                Arraste os cards abaixo para os quadros de domingo. Solte aqui para remover.
                            </p>
                            {collaborators.map(colab => (
                                <div 
                                    key={colab.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, colab, null)}
                                    onDragEnd={handleDragEnd}
                                    className="bg-white border border-gray-200 p-3 rounded-lg shadow-sm flex items-center gap-3 cursor-grab hover:border-red-300 hover:shadow-md transition-all group"
                                >
                                    <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-red-400 shrink-0" />
                                    <div className="overflow-hidden">
                                        <p className="font-bold text-sm text-gray-800 truncate" title={colab.name}>{colab.name}</p>
                                        <p className="text-[10px] text-gray-500 uppercase">{colab.shift || 'Sem turno'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* LADO DIREITO: Kanban dos Domingos */}
                <div className={`flex-1 flex overflow-x-auto gap-4 pb-4 ${readOnly ? 'justify-start' : ''}`}>
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>
                    ) : (
                        sundays.map((sunday) => {
                            const dateString = formatDateString(sunday);
                            const assignedColabs = schedule[dateString] || [];
                            const formattedDay = sunday.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

                            return (
                                <div 
                                    key={dateString} 
                                    className="w-72 bg-gray-100 rounded-xl border border-gray-200 shadow-inner flex flex-col shrink-0 overflow-hidden"
                                    onDragOver={!readOnly ? handleDragOver : undefined}
                                    onDrop={!readOnly ? (e) => handleDrop(e, dateString) : undefined}
                                >
                                    <div className="p-3 bg-white border-b border-gray-200 flex justify-between items-center">
                                        <div>
                                            <h3 className="font-black text-gray-900">Domingo</h3>
                                            <p className="text-xs font-bold text-red-600">{formattedDay}</p>
                                        </div>
                                        <div className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-md">
                                            {assignedColabs.length} {assignedColabs.length === 1 ? 'pessoa' : 'pessoas'}
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 p-3 overflow-y-auto space-y-2">
                                        {assignedColabs.length === 0 ? (
                                            <div className="h-full flex items-center justify-center text-center p-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 text-sm">
                                                {readOnly ? 'Sem plantonistas' : 'Arraste um colaborador aqui'}
                                            </div>
                                        ) : (
                                            assignedColabs.map((colab) => (
                                                <div 
                                                    key={`${dateString}-${colab.id}`}
                                                    draggable={!readOnly}
                                                    onDragStart={!readOnly ? (e) => handleDragStart(e, colab, dateString) : undefined}
                                                    onDragEnd={!readOnly ? handleDragEnd : undefined}
                                                    className={`bg-white border-l-4 border-l-red-500 border-y border-r border-gray-200 p-3 rounded-lg shadow-sm flex justify-between items-center transition-all group ${!readOnly ? 'cursor-grab hover:shadow-md' : 'cursor-default'}`}
                                                >
                                                    <div className="overflow-hidden pr-2">
                                                        <p className="font-bold text-sm text-gray-800 truncate" title={colab.name}>{colab.name}</p>
                                                        <p className="text-[10px] text-gray-500 uppercase">{colab.shift || 'Sem turno'}</p>
                                                    </div>
                                                    {!readOnly && (
                                                        <button 
                                                            onClick={() => removeColab(dateString, colab.id)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                                            title="Remover do plantão"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default SundaySchedule;