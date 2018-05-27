exports.ms = function (ts) {
    return 'utc ' + new Date(ts).toUTCString() + ' (' + ts + ' s)';
}


exports.ms2 = function (ts) {
    ts = ts / 1000
    return exports.ms(ts);
}

exports.int = function (float) {
    return Math.round(float);
}