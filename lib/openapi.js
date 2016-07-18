'use strict';

const http = require('http');
const url = require('url');
const qs = require('querystring');
const send = require('send');
const path = require('path');

class OpenApi {
    constructor(db, port) {
        this.db = db;
        this.rules = [{
            rule: /^\/$/,
            handler: this.index.bind(this)
        }, {
            rule: /^\/data\/handler\/(.*?)\/day\/(\d*)\/?/,
            handler: this.getHandlerData.bind(this)
        }, {
            rule: /^\/data\/handler\/(.*)\/?/,
            handler: this.getHandlerData.bind(this)
        }, {
            rule: /^\/assert\/(.*)/,
            handler: this.serveAssert.bind(this)
        }];
        this.server = http.createServer(this.handler.bind(this));
        this.port = port;
    }
    handler(req, res) {
        req.query = qs.parse(url.parse(req.url).query);
        res.mayJSONP = (data) => {
            let jsonpCallback = req.query.callback;
            let body = JSON.stringify(data);
            res.setHeader('Content-Type', 'application/json;charset=utf-8');
            if (jsonpCallback) {
                jsonpCallback = encodeURIComponent(jsonpCallback.replace(/[^\[\]\w$.]/g, ''));
                // replace chars not allowed in JavaScript that are in JSON
                body = body.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
                // the /**/ is a specific security mitigation for "Rosetta Flash JSONP abuse"
                // the typeof check is just to reduce client error noise
                res.end(`/**/ typeof ${jsonpCallback} === \'function\' && ${jsonpCallback}(${body})`);
            }
            else {
                res.end(body);
            }
        };
        let found = false;
        for (let i = 0; i < this.rules.length; i++) {
            const rule = this.rules[i];
            const match = url.parse(req.url).pathname.match(rule.rule);
            if (match) {
                req.params = match.slice(1);
                rule.handler(req, res);
                found = true;
                break;
            }
        }
        if (!found) {
            res.statusCode = 404;
            res.end('Not Found');
        }
    }
    run() {
        this.server.listen(this.port);
    }
    getHandlerData(req, res) {
        Promise.fromCallback(cb => {
            let query = {
                id: req.params[0]
            };
            if (req.params[1]) {
                query.day = parseInt(req.params[1], 10);
            }
            return this.db.find(query, cb);
        }).then(doc => {
            if (!doc) {
                throw new Error('invalid params');
            }
            res.mayJSONP({
                data: doc,
                errno: 0
            });
        }).catch(e => {
            res.mayJSONP({
                msg: e.message,
                errno: 10000
            });
        });
    }
    index(req, res) {
        send(req, path.join(__dirname, '..', 'assert', 'index.html')).pipe(res);
    }
    serveAssert(req, res) {
        send(req, path.join(__dirname, '..', 'assert', req.params[0])).pipe(res);
    }
}

module.exports = OpenApi;