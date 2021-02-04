const child_process = require('child_process');
const fs = require('fs');
const path = require('path');

const main = async () => {
    const indexJSON = JSON.parse(fs.readFileSync('index.json'));
    indexJSON.forEach(entry => {
        const result = child_process.execSync(`node ./scripts/add.js "${entry.path || entry.url}" "${entry.modelId || ''}"`, {
            cwd: path.dirname(__dirname)
        })
        console.log(result.toString())
    })
}

return main();
