'use strict';
global.Promise = require('bluebird');
const WebSocket = require('ws');
const path = require('path');
const Datastore = require('nedb');
const OpenApi = require('./lib/openapi');
const PERSISTENT_FILE = path.join(__dirname, 'PERSISTENT_FILE.json');
const HOSTNAME = require('os').hostname();
const constant = require('./lib/constant');
const AppearInGroupHandler = require('./lib/handlers/appear').AppearInGroupHandler;
const UidMapHandler = require('./lib/handlers/uidmap');
const VoteHanlder = require('./lib/handlers/vote');

const db = new Datastore({
  filename: PERSISTENT_FILE,
  autoload: true
});

class App {
  constructor(url, db, port) {
    this.handlers = [];
    this.url = url;
    this.db = db;
    this.port = port;
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
    new OpenApi(this.db, this.port).run();
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
        catch (e) {
          console.error(e);
        }
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
  _update(query, data) {
    const self = this;
    return Promise.fromCallback(cb => {
      self.db.update(query, data, {
        upsert: true
      }, cb);
    });
  }
  dump() {
    const self = this;
    const dumpTasks = this.handlers.map(handler => {
      if (!handler.hasChange()) {
        return;
      }
      const dumps = handler.dump();
      let query = {
        id: handler.id
      };
      if (handler.byDay) {
        dumps.day = handler.today;
        query.day = handler.today;
      }
      return self._update(query, dumps);
    });
    return Promise.all(dumpTasks);
  }
  load() {
    const self = this;
    const load = this.handlers.map(handler => {
      return Promise.fromCallback(cb => {
        let query = {
          id: handler.id
        };
        if (handler.byDay) {
          query.day = handler.today;
        }
        return self.db.findOne(query, cb);
      }).then(doc => {
        doc && handler.load(doc);
      });
    });
    return Promise.all(load);
  }
}

const findLeemarsID = 'APPEAR_IN_GROUP_' + constant.THIRD_ROBOT_GROUP_ID;
const app = new App('ws://10.94.243.99:8999', db, 8998);
const findLeemars = new AppearInGroupHandler(
  findLeemarsID,
  '*',
  constant.THIRD_ROBOT_GROUP_ID
);
if (HOSTNAME !== 'hefangshideMacBook-Pro.local') {
  findLeemars.on('appear', e => {
    if (e.isFirstAppear && e.id === constant.LEEMARS_UID) {
      // const nowTime = new Date(e.time);
      // app.talk(e.reply_to, e.type, `/vote ${nowTime.getHours()}:${nowTime.getMinutes()}`);
      app.talk(e.reply_to, e.type, '群主的铁♂拳制裁你们!!!');
    }
    if (e.isFirstAppear && e.id === constant.BERG_UID) {
      app.talk(e.reply_to, e.type, '听说berg和群主有不可告人的秘♂密( ′_ゝ`)′_ゝ`)′_ゝ`)');
    }
  });
}

app.use(findLeemars);
app.use(new UidMapHandler('UID_MAP'));
app.use(new VoteHanlder(
    'VOTE_' + constant.LEEMARS_UID,
    constant.THIRD_ROBOT_GROUP_ID,
    constant.LEEMARS_UID,
    findLeemarsID
  )
);

app.load().then(() => {
  return app.run();
}).then(() => {
  if (HOSTNAME !== 'hefangshideMacBook-Pro.local') {
    app.talk(constant.HEFANGSHI_UID, 1, `我在 ${HOSTNAME} 启动啦~`);
  }
}).catch(console.error);
