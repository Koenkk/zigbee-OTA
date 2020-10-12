const path = require('path');
const fs = require('fs');
const ota = require('../lib/ota');
const filenameOrURL = process.argv[2];
const baseURL = 'https://github.com/Koenkk/zigbee-OTA/raw/master';

const manufacturerNameLookup = {
    4107: 'Hue',
    4474: 'Insta',
    4448: 'Sengled',
    4420: 'Lutron',
    4405: 'DresdenElektronik',
    4489: 'Ledvance',
    4364: 'Osram',
    4098: 'Tuya'
};

const main = async () => {
    if (!filenameOrURL) {
        throw new Error('Please provide a filename or URL');
    }

    const isURL = filenameOrURL.toLowerCase().startsWith("http");
    let file = null;

    if (isURL) {
        const downloadFile = async (url, path) => {
            const lib = url.toLowerCase().startsWith("https") ? require('https') : require('http');
            const file = fs.createWriteStream(path);

            return new Promise((resolve) => {
                const request = lib.get(url, function(response) {
                  response.pipe(file);
                  file.on('finish', function() {
                    file.close(function() {
                        resolve();
                    });
                  });
                });
            });
        }

        file = path.resolve("temp");
        await downloadFile(filenameOrURL, file);
    } else {
        file = path.resolve(filenameOrURL);
        if (!fs.existsSync(file)) {
            throw new Error(`${file} does not exist`);
        }
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
    };

    if (isURL) {
        entry.url = filenameOrURL;
    } else {
        const destinationPosix = destination.replace(/\\/g, '/');
        entry.url = `${baseURL}/${destinationPosix}`;
        entry.path = destinationPosix;
    }

    const index = indexJSON.findIndex((i) => {
        return i.manufacturerCode === entry.manufacturerCode && i.imageType === entry.imageType
    });

    if (index !== -1) {
        console.log(`Updated existing entry (${JSON.stringify(entry)})`);
        indexJSON[index] = entry;

        if (entry.path) {
            fs.unlinkSync(entry.path);
        }
    } else {
        console.log(`Added new entry (${JSON.stringify(entry)})`);
        indexJSON.push(entry);
    }

    if (!isURL) {
        if (!fs.existsSync(path.dirname(destination))) {
            fs.mkdirSync(path.dirname(destination));
        }

        fs.copyFileSync(file, destination);
    }

    fs.writeFileSync('index.json', JSON.stringify(indexJSON, null, '    '));

    if (isURL) {
        fs.unlinkSync(file);
    }
}

return main();
