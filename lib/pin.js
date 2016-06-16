'use strict';

const Boom = require('boom');
const twilio = require('./twilio');
const conf = require('./conf');
const client = twilio(conf.get('twilioSID'), conf.get('twilioToken'));
const db = require('./db').register('pins');
const utils = require('./utils');

const profile = require('./profile');

exports.verify = function (phone, pin, next) {
  phone = utils.fixNumber(phone);

  if (process.env.NODE_ENV !== 'test') {
    db.get('pin!' + phone, (err, foundPin) => {
      db.del('pin!' + phone);

      if (err || foundPin !== pin) {
        return next(new Error('Invalid pin'));
      }

      next(null, pin);
    });
  } else {
    if (parseInt(fixtures.pin, 10) !== parseInt(pin, 10)) {
      return next(new Error('Invalid pin'));
    }

    next(null, false);
  }
};

exports.generate = function (phone, next) {
  phone = utils.fixNumber(phone);

  const phoneHash = utils.phoneHash(phone);

  profile.get(phoneHash, (err) => {
    if (err && conf.get('disableSignups')) {
      return next(err);
    }

    const pin = Math.floor(Math.random() * (10000 - 1111 + 1) + 1111);

    // 5 minutes max TTL
    db.put('pin!' + phone, pin, { ttl: 300000 }, (err) => {
      if (err) {
        return next(err);
      }

      client.sendMessage({
        to: phone,
        from: '+' + conf.get('twilioNumber'),
        body: pin
      }, function (err) {

        if (err) {
          console.error(err);
          return next(Boom.wrap(new Error(err.message), err.status));
        }

        next(null, true);
      });
    });
  });
};
