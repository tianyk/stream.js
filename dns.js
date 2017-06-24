const pick = require('lodash/pick');
const LRU = require('lru-cache');
const dns = require('dnscache')({
    enable: true,
    max: 500,
    maxAge: 1000 * 60 * 60,
    cache: function (conf) {
        let lru = LRU(pick(conf, ['max', 'maxAge', 'length', 'dispose', 'stale']));

        this.set = (key, value, cb) => cb(null, lru.set(key, value));
        this.get = (key, cb) => cb(null, lru.get(key));
    }
});

exports = module.exports = dns;