const path = require('path');

exports.API_ENDPOINT = 'https://min-api.cryptocompare.com/data/';

exports.BASE_PATH = path.join(__dirname, '..');

exports.SQLITE_DB_PATH = path.join(exports.BASE_PATH, 'sqlite', 'crypto.db');
exports.SQLITE_SETUP_SCRIPT = path.join(exports.BASE_PATH, 'sqlite', 'setup-sqlite-tables.sql');

exports.INFRA_JSON = path.join(exports.BASE_PATH, 'crypto.json');

exports.NUM_CONCURRENT_REQ = 1;