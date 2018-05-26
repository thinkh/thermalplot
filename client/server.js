/* eslint no-console: 0 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const webpack = require('webpack');
const webpackMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require('webpack-hot-middleware');
const config = require('./webpack.config.js');
const socketio = require('socket.io');

const DATA_DIR = __dirname + '/data/';

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
        res.write(middleware.fileSystem.readFileSync(path.join(__dirname, 'dist/index.html')));
        res.end();
    });

    app.get('/version', function response(req, res) {
        const pjson = require('./package.json');
        res.write(pjson.version);
        res.end();
    });

    app.get('/views/:file', function response(req, res) {
        res.sendFile(__dirname + '/src/views/' + req.params.file);
    });

    app.get('/views/templates/:file', function response(req, res) {
        res.sendFile(__dirname + '/src/views/templates/' + req.params.file);
    });

    app.get('/images/:file', function response(req, res) {
        res.sendFile(__dirname + '/src/images/' + req.params.file);
    });

    app.get('/api/all_use_cases', function response(req, res) {
        res.sendFile(DATA_DIR + '/all_use_cases.json');
    });

    app.get('/api/uc/:usecase/$', function response(req, res) {
        res.sendFile(DATA_DIR + req.params.usecase + '/usecase_config.json');
    });

    app.get('/api/uc/:usecase/static_data/:file', function response(req, res) {
        res.sendFile(DATA_DIR + req.params.usecase + '/' + req.params.file);
    });

} else {
    app.use(express.static(__dirname + '/dist'));
    app.get('*', function response(req, res) {
        res.sendFile(path.join(__dirname, 'dist/index.html'));
    });
}

const server = app.listen(port, (err) => {
    if (err) {
        console.log(err);
    }
    console.info('==> Listening on port %s. Open up http://localhost:%s/ in your browser.', port, port);
});

const io = socketio(server);

io.use((socket, next) => {
    let useCaseName = socket.handshake.query.uc;
    console.log('check if use case %s exists', useCaseName);

    if (fs.existsSync(path.join(DATA_DIR, useCaseName))) {
        return next();
    }
    return next(new Error('unknown use case error'));
});

io.on('connection', function (socket) {
    let useCaseName = socket.handshake.query.uc;
    console.log('New socket connection to %s with id %s', useCaseName, socket.id);

    socket.emit('msg', { data: { internal: 'hello world' } }); // initial message

    socket.on('msg', function (data) {
        console.log(data);
    });
});
