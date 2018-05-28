const fs = require('fs');
const path = require('path');
const util = require('util');

const fetch = require('node-fetch');
const Database = require('better-sqlite3');


const API_ENDPOINT = 'https://min-api.cryptocompare.com/data/';

const BASE_PATH = path.join(__dirname, '..');

const SQLITE_DB_PATH = path.join(BASE_PATH, 'sqlite', 'crypto.db');

const INFRA_JSON = path.join(BASE_PATH, 'crypto.json');

/**
 * Update the top list of cryptocurrencies
 * @param {number} limit The number of data points to return 
 * @param {string} symbol The currency symbol to convert into [Max character length: 10]
 * @param {boolean} replaceInfraJson Replace the items in the infra.json (true) or write to a separate file (default: false)
 */
function updateTopList(limit = 250, symbol = 'USD', replaceInfraJson = false) {
    const infraJson = new Promise(function (resolve, reject) {
        fs.readFile(INFRA_JSON, 'utf8', function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    })
        .then((data) => JSON.parse(data));


    const newChildren = fetch(`${API_ENDPOINT}top/totalvol?limit=${limit}&tsym=${symbol}`)
        .then(res => res.json())
        .then(json => {
            const r = {};
            json.Data.forEach(item => {
                // ThermalPlot infrastructure format
                r[item.CoinInfo.Name] = {
                    alias: item.CoinInfo.Name,
                    title: item.CoinInfo.FullName,
                    traits: ['s']
                };
            });
            return r;
        });


    Promise.all([infraJson, newChildren])
        .then(jsons => {
            jsons[0].root.children = jsons[1];
            return jsons[0];
        })
        .then(infraJson => {
            const filename = (replaceInfraJson) ? INFRA_JSON : 'currency_info.json';

            //const writeFile = util.promisify(fs.writeFile);
            //return writeFile('currency_info.json', JSON.stringify(json))
            return new Promise(function (resolve, reject) {
                fs.writeFile(filename, JSON.stringify(infraJson), function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(filename);
                    }
                });
            });
        })
        .then(filename => console.log(`Top list updated with ${limit} items! The file is located at ${filename}`))
        .catch(err => {
            console.error(err);
        });
}

//updateTopList(250, 'USD', true);