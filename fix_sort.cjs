const fs = require('fs');
let code = fs.readFileSync('src/pages/DataManager.jsx', 'utf8');

const regex = /            fetchedData\.sort\(\(a, b\) => \{[\s\S]*?            \}\);/;

const replacement = `            fetchedData.sort((a, b) => {
                const getDateValue = (item) => {
                    if (item.date) {
                        if (typeof item.date === 'string' && item.date.match(/^\\d{4}-\\d{2}-\\d{2}$/)) {
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
            });`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/pages/DataManager.jsx', code);
