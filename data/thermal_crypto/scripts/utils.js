const fs = require('fs');

exports.getInfraJson = function (filename) {
    return new Promise(function (resolve, reject) {
        fs.readFile(filename, 'utf8', function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    })
        .then((data) => JSON.parse(data))
        .catch((err) => err);
}

exports.getSymbols = async function (filename) {
    const infraJson = await exports.getInfraJson(filename);
    return Object.keys(infraJson.root.children);
}
