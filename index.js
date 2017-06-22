const stream = require('stream');
const util = require('util');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const is = require('is-type-of');
const Readable = stream.Readable;
const Writable = stream.Writable;
const Duplex = stream.Duplex;
const Transform = stream.Transform;

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

function createCDNReadStream(url, cb) {
    let urlHash = md5(url);

    fs.open(path.join(__dirname, urlHash), 'r', (err, fd) => {
        if (err) {
            if (err.code === 'ENOENT') {
                let req = http.get(url, (message) => {
                    let headWriteStream = fs.createWriteStream(path.join(__dirname, `${urlHash}_header`));
                    headWriteStream.write(`HTTP/${message.httpVersion} ${message.statusCode} ${message.statusMessage}\r\n`);
                    for (let header in message.headers) 
                        headWriteStream.write(`${header}: ${message.headers[header]}\r\n`);
                    // headWriteStream.end('\r\n');
                    headWriteStream.write('\r\n');

                    // cb(null, message.pipe(new CDNTransform(path.join(__dirname, `${urlHash}_body`))));
                    cb(null, message.pipe(new CDNTransform(headWriteStream)));
                });

                req.on('error', (err) => {
                    cb(err);
                });
            } else {
                cb(err);
            }
        } else {
            cb(null, fs.createReadStream(path.join(__dirname, urlHash)));
        }
    });
}

// cat 76ced47a8c74747924990e7ec50124e4_header | nc -l 8080
// visit: http://localhost:8080
createCDNReadStream(`http://www.baidu.com?_=${Date.now()}`, (err, readStream) => {
    if (err) throw err;
    readStream.pipe(process.stdout);
})