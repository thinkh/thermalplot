const fs = require('fs');
const fetch = require('node-fetch');
const utils = require('./utils');
const config = require('./config');

/**
 * Update the top list of cryptocurrencies
 * @param {number} limit The number of data points to return (default: 250)
 * @param {string} tsym The currency symbol to convert into [Max character length: 10] (default: USD)
 * @param {boolean} replaceInfraJson Replace the items in the infra.json (true) or write to a separate file (default: false)
 */
async function updateTopList(limit = 50, pages = 5, tsym = 'USD', replaceInfraJson = false) {
    const infraJson = await utils.getInfraJson(config.INFRA_JSON);

    const promise = new Promise((resolve, reject) => {
        let newChildren = [];

        function loadTopList() {
            if (pages === 0) {
                clearInterval(timer);
                resolve(newChildren);
                return;
            }

            console.log(`loading page ${pages}`);

            fetch(`${config.API_ENDPOINT}top/totalvol?limit=${limit}&tsym=${tsym}&page=${pages}`)
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
                    console.log(`loaded ${json.Data.length} items`);
                    newChildren = [r, ...newChildren];
                });

            pages--;
        }

        const timer = setInterval(loadTopList, 2000);
    });

    Promise.all([infraJson, promise])
        .then(jsons => {
            jsons[0].root.children = Object.assign({}, ...jsons[1]);
            return jsons[0];
        })
        .then(infraJson => {
            const filename = (replaceInfraJson) ? config.INFRA_JSON : 'currency_info.json';

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

updateTopList(50, 5, 'USD', true); // 5 * 50 = 250 items