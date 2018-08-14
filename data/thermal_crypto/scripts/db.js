const fs = require('fs');
const Database = require('better-sqlite3');

exports.open = (path) => {
    return new Database(path, {});
}

exports.close = (dbHandler) => {
    dbHandler.close();
}

exports.prepareTables = async (dbHandler, filename) => {
    return new Promise(function (resolve, reject) {
        fs.readFile(filename, 'utf8', function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    })
        .then((sqlStatements) => {
            //console.log(sqlStatements);
            dbHandler.exec(sqlStatements);
            return true;
        })
        .catch((err) => err);
}