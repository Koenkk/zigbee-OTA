# zigbee-OTA
A collection of Zigbee OTA files, see `index.json` for an overview of all available firmware files.

## Adding new and updating existing OTA files
1. Go to this directory
2. Execute `node scripts/add.js PATH_TO_OTA_FILE_OR_URL`, e.g.:
    - `node scripts/add.js ~/Downloads/WhiteLamp-Atmel-Target_0105_5.130.1.30000_0012.sbl-ota`
    - `node scripts/add.js http://fds.dc1.philips.com/firmware/ZGB_100B_010D/1107323831/Sensor-ATmega_6.1.1.27575_0012.sbl-ota`
3. Create a PR

## Updating all existing OTA entries (if add.js has been changed)
1. Go to this directory
2. Execute `node scripts/updateall.js`
3. Create a PR
