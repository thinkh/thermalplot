/* eslint no-console: 0 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const webpack = require('webpack');
const webpackMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require('webpack-hot-middleware');
const config = require('../webpack.config.js');
const socketio = require('socket.io');
const logger = require('./logger');
const UseCaseDBSocketHandler = require('./UseCaseDBSocketHandler');

const PROJECT_ROOT = path.join(__dirname, '../');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

const isDeveloping = process.env.NODE_ENV !== 'production';
const port = isDeveloping ? 3000 : process.env.PORT;
const app = express();

if (isDeveloping) {
    const compiler = webpack(config);
    const middleware = webpackMiddleware(compiler, {
        publicPath: config.output.publicPath,
        contentBase: 'src',
        stats: {
            colors: true,
            hash: false,
            timings: true,
            chunks: false,
            chunkModules: false,
            modules: false
        }
    });

    app.use(middleware);
    app.use(webpackHotMiddleware(compiler));

    app.get('/', function response(req, res) {
        res.write(middleware.fileSystem.readFileSync(path.join(PROJECT_ROOT, 'dist/index.html')));
        res.end();
    });

    app.get('/version', function response(req, res) {
        const pjson = require(path.join(PROJECT_ROOT, 'package.json'));
        res.write(pjson.version);
        res.end();
    });

    app.get('/views/:file', function response(req, res) {
        res.sendFile(path.join(PROJECT_ROOT, '/src/views/', req.params.file));
    });

    app.get('/views/templates/:file', function response(req, res) {
        res.sendFile(path.join(PROJECT_ROOT, '/src/views/templates/', req.params.file));
    });

    app.get('/images/:file', function response(req, res) {
        res.sendFile(path.join(PROJECT_ROOT, '/src/images/', req.params.file));
    });

} else {
    app.use(express.static(PROJECT_ROOT + '/dist'));
    app.get('/', function response(req, res) {
        res.sendFile(path.join(PROJECT_ROOT, 'dist/index.html'));
    });
}

app.get('/api/all_use_cases$', function response(req, res) {
    res.sendFile(path.join(DATA_DIR, '/all_use_cases.json'));
});

app.get('/api/uc/:usecase/$', function response(req, res) {
    res.sendFile(path.join(DATA_DIR, req.params.usecase, '/usecase_config.json'));
});

app.get('/api/uc/:usecase/static_data/:file$', function response(req, res) {
    res.sendFile(path.join(DATA_DIR, req.params.usecase, req.params.file));
});

app.get('/api/uc/:usecase/csv/:field/:startdate(\\d{4}-\\d{2}-\\d{2})/:enddate(\\d{4}-\\d{2}-\\d{2})/:order_by(asc|desc)$', function response(req, res) {
    const ucServerPath = path.join(DATA_DIR, req.params.usecase, 'server/index.js');
    logger.info('require usecase server part from %s', ucServerPath);
    const ucServer = require(ucServerPath);
    const handler = new ucServer.CSVHandler(res);
    handler.get(req.params.field, req.params.startdate, req.params.enddate, req.params.order_by);
});

const server = app.listen(port, (err) => {
    if (err) {
        logger.info(err);
    }
    logger.info('==> Listening on port %s. Open up http://localhost:%s/ in your browser.', port, port);
});

const io = socketio(server);

io.use((socket, next) => {
    let useCaseName = socket.handshake.query.uc;
    logger.info('check if use case %s exists', useCaseName);

    if (fs.existsSync(path.join(DATA_DIR, useCaseName))) {
        return next();
    }
    return next(new Error('unknown use case error'));
});

io.on('connection', function (socket) {
    let useCaseName = socket.handshake.query.uc;
    logger.info('new socket connection to %s with id %s', useCaseName, socket.id);

    const ucServerPath = path.join(DATA_DIR, useCaseName, 'server/index.js');
    logger.info('require usecase server part from %s', ucServerPath);
    const ucServer = require(ucServerPath);
    const handler = new ucServer.SocketHandler(socket);

    handler.open();

    //socket.emit('msg', { data: { internal: 'hello world' } }); // initial message

    socket.on('disconnect', (reason) => {
        logger.info('disconnect socket connection with reason: %s', reason);
        handler.close();
    });
});
