'use strict';

const uuid = require('uuid');
const Boom = require('boom');
const conf = require('./conf');

const ban = require('./ban');
const pin = require('./pin');

const dbs = require('./db');
const db = dbs.register('logins', { ttl: true });
const profdb = dbs('profile');
const bandb = dbs('bans');
const utils = require('./utils');

let addNewUser = function (uid, phone, request, reply) {
  profdb.put('uid!' + uid, phone, function (err) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    profdb.put('user!' + phone, {
      uid: uid,
      phone: phone,
      showreplies: true,
      secondary: {}
    }, function (err) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      request.auth.credentials.uid = uid;
      request.auth.credentials.phone = phone;
      return reply.redirect('/');
    });
  });
};

let checkAdmin = function (uid, request) {
  if (conf.get('ops').indexOf(uid) > -1) {
    request.auth.credentials.op = true;
    return;
  }
};

let register = function (request, reply) {
  // phone number has to stay pre-hashed at this point
  let prehashPhone = utils.fixNumber(request.auth.credentials.phone);
  let phone = utils.phoneHash(prehashPhone);

  console.log('logging in ', phone);

  profdb.get('user!' + phone, (err, user) => {
    if (err || !user) {
      // Test secondary phone first before assuming it is a new registration
      profdb.get('secondary!' + phone, (err, primary) => {
        if (err || !primary) {
          // register new user

          if (conf.get('disableSignups')) {
            return reply.redirect('/no_new_accounts');
          } else {
            var uid = uuid.v4();
            addNewUser(uid, phone, request, reply);
          }
        } else {
          profdb.get('user!' + primary, (err, user) => {
            if (err) {
              // This shouldn't happen at all since attaching a secondary phone to
              // a non-existent primary means the data is faulty.
              return reply(Boom.wrap(err, 500));
            }

            checkAdmin(user.uid, request);
            request.auth.credentials.phone = primary;
            request.auth.credentials.uid = user.uid;
            request.auth.credentials.name = user.name;
            return reply.redirect('/');
          });
        }
      });
    } else {
      checkAdmin(user.uid, request);
      // now that we've validated with a PIN, we can convert the session phone to the hashed one
      request.auth.credentials.phone = primary;
      request.auth.credentials.uid = user.uid;
      request.auth.credentials.name = user.name;
      reply.redirect('/');
    }
  });
};

exports.login = function (request, reply) {
  const prehashPhone = request.payload.phone;
  const phone = utils.phoneHash(prehashPhone);
  const ip = request.info.remoteAddress;

  if (!ip) {
    return reply(Boom.wrap(new Error('remote ip required'), 400));
  }

  let generate = function () {
    pin.generate(prehashPhone, (err) => {
      if (err) {
        if (conf.get('disableSignups')) {
          return reply.redirect('/no_new_accounts');
        } else {
          return reply(Boom.wrap(err, 400));
        }
      }

      // set session phone temporarily to the prehashed one so that we can verify auth later
      request.auth.credentials.phone = prehashPhone;
      reply.redirect('/authenticate');
    });
  };

  let getLoginAttempts = function () {
    db.get(phone, (err, count) => {
      if (!err) {
        count++;
        if (count > 3) {
          // ban if there are more than 3 login attempts in a span of 5 minutes
          ban.hammer(ip, (err) => {
            if (err) {
              console.error(err);
            }
          });
          return reply(Boom.wrap(new Error('Your number has been banned. Please contact an operator.'), 400));
        }
      } else {
        count = 0;
      }

      db.put(phone, count, { ttl: 300000 }, (err) => {
        if (err) {
          return reply(Boom.wrap(err, 400));
        }

        generate();
      });
    });
  };

  bandb.get(ip, (err) => {
    if (!err) {
      return reply(Boom.wrap(new Error('Your number has been banned. Please contact an operator.'), 400));
    }

    getLoginAttempts();
  });
};

exports.authenticate = function (request, reply) {
  // still using the real phone number, will convert to hashed one on registration
  const phone = utils.fixNumber(request.auth.credentials.phone);

  pin.verify(phone, request.payload.pin, (err) => {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    register(request, reply);
  });
};

exports.logout = function (request, reply) {
  request.session.reset();
  reply.redirect('/');
};
