const stream = require('stream');
const util = require('util');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const url = require('url');
const is = require('is-type-of');
const Agent = require('agentkeepalive');

const Readable = stream.Readable;
const Writable = stream.Writable;
const Duplex = stream.Duplex;
const Transform = stream.Transform;

const agentOptions = {
    maxSockets: 100,
    maxFreeSockets: 10,
    timeout: 60000,
    freeSocketKeepAliveTimeout: 30000
};
const httpKeepaliveAgent = new Agent(agentOptions);
const httpsKeepaliveAgent = new Agent.HttpsAgent(agentOptions);

function MyWritable(options) {
    if (!(this instanceof MyWritable))
        return new MyWritable(options);
    Writable.call(this, options);
}
util.inherits(MyWritable, Writable);


MyWritable.prototype._write = function (data, encoding, cb) {
    console.log('%s\t%s', new Date(), data.toString());
    cb();
}

// fs.createReadStream(path.join(__dirname, 'logStream.js')).pipe(new MyWritable());

// ---------------------------------------

function MyReadable(options) {
    if (!(this instanceof MyReadable))
        return new MyReadable(options);
    Readable.call(this, options);

    this._max = 10;
    this._index = 1;
}
util.inherits(MyReadable, Readable);

MyReadable.prototype._read = function () {
    let self = this;
    if (self._index >= self._max) return self.push(null); // PUSH null会结束读取流

    setTimeout(function () {
        self.push(Buffer.from(new Date().toISOString() + ` ${++self._index} \n`), 'utf8');
    }, 1000);
}

// new MyReadable().pipe(process.stdout);
// new MyReadable().pipe(new MyWritable());

// ---------------------------------------

function MyDuplex(options) {
    if (!(this instanceof MyDuplex))
        return new MyDuplex(options);
    Duplex.call(this, options);
    this._max = 10;
    this._index = 1;
}
util.inherits(MyDuplex, Duplex);

MyDuplex.prototype._read = function () {
    let self = this;
    if (self._index >= self._max) return self.push(null); // PUSH null会结束读取流

    setTimeout(function () {
        self.push(Buffer.from(new Date().toISOString() + ` ${++self._index}`), 'utf8');
    }, 1000);
}

MyDuplex.prototype._write = function (data, encoding, cb) {
    console.log('%s\t%s', new Date(), data.toString());
    cb();
}

// let myDuplex = new MyDuplex();
// myDuplex.pipe(myDuplex).pipe(myDuplex);

// ---------------------------------------
function md5(str) {
    var md5sum = crypto.createHash('md5');
    md5sum.update(str);
    str = md5sum.digest('hex');
    return str;
}

function CDNTransform(stream, options) {
    if (!(this instanceof CDNTransform))
        return new CDNTransform(options);
    Transform.call(this, options);

    if (is.writableStream(stream))
        this.writeStream = stream;
    else
        this.writeStream = fs.createWriteStream(stream);
}
util.inherits(CDNTransform, Transform);

CDNTransform.prototype._transform = function (chunk, encoding, callback) {
    this.writeStream.write(chunk, encoding);
    callback(null, chunk);
}

function HtmlTransform(options) {
    if (!(this instanceof HtmlTransform))
        return new HtmlTransform(options);
    Transform.call(this, options);
    this.skip = false;
}
util.inherits(HtmlTransform, Transform);

HtmlTransform.prototype._transform = function (chunk, encoding, callback) {
    if (!this.skip) {
        let pos = chunk.indexOf('\r\n\r\n');
        if (-1 !== pos) {
            chunk = chunk.slice(pos + 4);
            this.skip = true;
        }
    }

    callback(null, chunk);
}

function createCDNReadStream(uri, cb) {
    let htmlFilePath = path.join(__dirname, md5(uri));

    try {
        uri = url.parse(uri);
    } catch (e) {
        return cb(e);
    }
    fs.open(htmlFilePath, 'r', (err) => {
        if (err) {
            if (err.code === 'ENOENT') {
                let request = (uri.protocol === 'http:') ? http : https;
                uri.agent = (uri.protocol === 'http:') ? httpKeepaliveAgent : httpsKeepaliveAgent;

                let req = request.get(uri, (message) => {
                    let responseWriteStream = fs.createWriteStream(htmlFilePath);
                    responseWriteStream.write(`HTTP/${message.httpVersion} ${message.statusCode} ${message.statusMessage}\r\n`);
                    for (let header in message.headers)
                        responseWriteStream.write(`${header}: ${message.headers[header]}\r\n`);
                    responseWriteStream.write('\r\n');

                    cb(null, message.pipe(new CDNTransform(responseWriteStream)));
                });

                req.on('error', (err) => {
                    cb(err);
                });
            } else {
                cb(err);
            }
        } else {
            cb(null, fs.createReadStream(htmlFilePath).pipe(new HtmlTransform()));
        }
    });
}

// cat 76ced47a8c74747924990e7ec50124e4_header | nc -l 8080
// visit: http://localhost:8080

let uri = 'https://www.baidu.com';
uri = 'http://127.0.0.1:8080/P60524-122812.jpg';
// uri = `${uri}?_=${Date.now()}`;
createCDNReadStream(uri, (err, readStream) => {
    if (err) throw err;
    readStream.pipe(process.stdout);
});