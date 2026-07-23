const fs = require('fs');
let code = fs.readFileSync('src/pages/DataManager.jsx', 'utf8');

if (!code.includes('const [qaProcesses, setQaProcesses] = useState({});')) {
    code = code.replace(
        'const [collaboratorsMap, setCollaboratorsMap] = useState({});',
        'const [collaboratorsMap, setCollaboratorsMap] = useState({});\n    const [qaProcesses, setQaProcesses] = useState({});'
    );
    
    const useEffectRegex = /    useEffect\(\(\) => \{\s+const unsubColabs = onSnapshot\(collection\(db, "collaborators"\), \(snapshot\) => \{[\s\S]*?        return \(\) => unsubColabs\(\);\n    \}, \[\]\);/;
    
    const replacement = `    useEffect(() => {
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
    }, []);`;
    
    code = code.replace(useEffectRegex, replacement);
    fs.writeFileSync('src/pages/DataManager.jsx', code);
}
