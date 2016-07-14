'use strict';
global.Promise = require('bluebird');
const WebSocket = require('ws');
const path = require('path');
const PERSISTENT_FILE = path.join(__dirname, 'PERSISTENT_FILE.json');
const HOSTNAME = require('os').hostname();
const LEEMARS_UID = 16888043;
const BERG_UID = 13037728;
const HEFANGSHI_UID = 11725261;
const GROUP = 1462626;
const Datastore = require('nedb');
const AppearInGroupHandler = require('./lib/appear').AppearInGroupHandler;
const UidMapHandler = require('./lib/uidmap');
const db = new Datastore({
  filename: PERSISTENT_FILE,
  autoload: true
});

class App {
  constructor(url, db) {
    this.handlers = [];
    this.url = url;
    this.db = db;
    this.db.persistence.setAutocompactionInterval(30000);
  }
  use(handler) {
    this.handlers.push(handler);
    handler.setApp(this);
  }
  onMsg(msg) {
    this.handlers.forEach(handler => {
      handler.onMsg(msg);
    });
    this.dump().catch(console.error);
  }
  talk(to, type, msg) {
    this.ws.send(JSON.stringify({
      reply_to: to,
      msg_type: type,
      msg: msg
    }));
  }
  run() {
    const self = this;
    return new Promise((resolve, reject) => {
      self.ws = new WebSocket(self.url, {
        protocolVersion: 13
      });
      self.ws.on('open', () => {
        console.log('hiservice connected');
        resolve(self);
      });
      self.ws.on('message', (msg) => {
        try {
          self.onMsg(JSON.parse(msg));
        }
        catch (e) {}
      });
      self.ws.on('error', (err) => {
        console.error('ws connect failed', err);
        reject(err);
        setTimeout(() => {
          self.run();
        }, 5 * 1000);
      });
    });
  }
  dump() {
    const self = this;
    const dump = this.handlers.map(handler => {
      if (!handler.hasChange()) {
        return;
      }
      return Promise.fromCallback(cb => {
        self.db.update({
          id: handler.id
        }, handler.dump(), {
          upsert: true
        }, cb);
      });
    });
    return Promise.all(dump);
  }
  load() {
    const self = this;
    const load = this.handlers.map(handler => {
      return Promise.fromCallback(cb => {
        return self.db.findOne({
          id: handler.id
        }, cb);
      }).then(doc => {
        doc && handler.load(doc);
      });
    });
    return Promise.all(load);
  }
}

const app = new App('ws://10.94.169.106:8999', db);
const findLeemars = new AppearInGroupHandler('APPEAR_IN_GROUP', '*', GROUP);
findLeemars.on('appear', e => {
  if (e.isFirstAppear && e.id === LEEMARS_UID) {
    app.talk(e.reply_to, e.type, '群主的铁♂拳制裁你们!!!');
  }
  if (e.isFirstAppear && e.id === BERG_UID) {
    app.talk(e.reply_to, e.type, '听说berg和群主有不可告人的秘♂密( ′_ゝ`)′_ゝ`)′_ゝ`)');
  }
});

app.use(findLeemars);
app.use(new UidMapHandler('UID_MAP'));

app.load().then(() => {
  return app.run();
}).then(() => {
  if (HOSTNAME !== 'hefangshideMacBook-Pro.local') {
    app.talk(HEFANGSHI_UID, 1, `我在 ${HOSTNAME} 启动啦~`);
  }
}).catch(console.error);
