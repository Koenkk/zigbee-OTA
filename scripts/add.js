const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ota = require('../lib/ota');
const filenameOrURL = process.argv[2];
const modelId = process.argv[3];
const baseURL = 'https://github.com/Koenkk/zigbee-OTA/raw/master';

const manufacturerNameLookup = {
    4107: 'Hue',
    4117: 'Develco',
    4129: 'Legrand',
    4474: 'Insta',
    4448: 'Sengled',
    4420: 'Lutron',
    4405: 'DresdenElektronik',
    4489: 'Ledvance',
    4364: 'Osram',
    4648: 'Terncy',
    4098: 'Tuya',
    4151: 'Jennic',
    4678: 'Danfoss',
    4687: 'Gledopto',
    4919: 'Datek',
    4447: 'Xiaomi',
    10132: 'ClimaxTechnology',
    4417: 'Telink',
    4338: 'ubisys',
    4742: 'Sonoff',
    4454: 'Innr',
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

            return new Promise((resolve, reject) => {
                const request = lib.get(url, function(response) {
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        response.pipe(file);
                        file.on('finish', function() {
                          file.close(function() {
                              resolve();
                          });
                        });
                    } else if (response.headers.location) {
                        resolve(downloadFile(response.headers.location, path));
                    } else {
                        reject(new Error(response.statusCode + ' ' + response.statusMessage));
                    }
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

    const hash = crypto.createHash('sha512');
    hash.update(buffer);

    const entry = {
        fileVersion: parsed.header.fileVersion,
        fileSize: parsed.header.totalImageSize,
        manufacturerCode: parsed.header.manufacturerCode,
        imageType: parsed.header.imageType,
        sha512: hash.digest('hex'),
    };

    if (modelId) {
        entry.modelId = modelId;
    }

    if (isURL) {
        entry.url = filenameOrURL;
    } else {
        const destinationPosix = destination.replace(/\\/g, '/');
        entry.url = `${baseURL}/${escape(destinationPosix)}`;
        entry.path = destinationPosix;
    }

    const index = indexJSON.findIndex((i) => {
        return i.manufacturerCode === entry.manufacturerCode && i.imageType === entry.imageType && (!i.modelId || i.modelId === entry.modelId)
    });

    if (index !== -1) {
        console.log(`Updated existing entry (${JSON.stringify(entry)})`);
        indexJSON[index] = {...indexJSON[index], ...entry};

        if (entry.path && entry.path !== destination) {
            try {
                fs.unlinkSync(path.resolve(entry.path));
            } catch (err) {
                if (err && err.code != 'ENOENT') {
                    console.error("Error in call to fs.unlink", err);
                    throw err;
                }
            }
        }
    } else {
        console.log(`Added new entry (${JSON.stringify(entry)})`);
        indexJSON.push(entry);
    }

    if (!isURL && file !== path.resolve(destination)) {
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

main();
