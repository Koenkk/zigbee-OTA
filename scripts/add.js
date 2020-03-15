const path = require('path');
const fs = require('fs');
const ota = require('../lib/ota');
const filename = process.argv[2];

const manufacturerNameLookup = {
    4107: 'Hue',
};

if (!filename) {
    throw new Error('Please provide a filename');
}

const file = path.resolve(filename);
if (!fs.existsSync(file)) {
    throw new Error(`${file} does not exist`);
}

const buffer = fs.readFileSync(file);
const parsed = ota.parseImage(buffer);

if (!manufacturerNameLookup[parsed.header.manufacturerCode]) {
    throw new Error(`${parsed.header.manufacturerCode} not in manufacturerNameLookup (please add it)`);
}

const manufacturerName = manufacturerNameLookup[parsed.header.manufacturerCode];
const indexJSON = JSON.parse(fs.readFileSync('index.json'));
const destination = path.join('images', manufacturerName, path.basename(file));

const entry = {
    fileVersion: parsed.header.fileVersion,
    fileSize: parsed.header.totalImageSize,
    manufacturerCode: parsed.header.manufacturerCode,
    imageType: parsed.header.imageType,
    url:  'TODO',
    path: destination,
};

const index = indexJSON.findIndex((i) => {
    return i.manufacturerCode === entry.manufacturerCode && i.imageType === entry.imageType
});

if (index !== -1) {
    console.log(`Updated existing entry (${JSON.stringify(entry)})`);
    indexJSON[index] = entry;
    fs.unlinkSync(entry.path)
} else {
    console.log(`Added new entry (${JSON.stringify(entry)})`);
    indexJSON.push(entry);
}

if (!fs.existsSync(path.dirname(destination))) {
    fs.mkdirSync(path.dirname(destination));
}

fs.copyFileSync(file, destination);

fs.writeFileSync('index.json', JSON.stringify(indexJSON, null, '    '));