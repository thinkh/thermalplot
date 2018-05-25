
import 'file-loader?name=index.html!extract-loader!html-loader?interpolate!./index.html';
import 'file-loader?name=404.html-loader!./404.html';
import 'file-loader?name=robots.txt!./robots.txt';
import 'file-loader?name=favicon_32x32.png!./favicon_32x32.png';
import './style.scss';
import * as io from 'socket.io-client';

import './scripts/app'


/*const socket = io({
    autoConnect: false
});

socket.on('connect', function () {
    console.log('new socket connection with id', socket.id);
    socket.emit('event', 'bla'); // initial message
});
socket.on('event', function (data) {
    console.log('socket event', data);

});
socket.on('disconnect', function () {
    console.log('socket disconnect');
});

setTimeout(() => {
    socket.connect();
}, 2000);
*/