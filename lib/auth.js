'use strict';

const uuid = require('uuid');
const Boom = require('boom');
const TP = require('twilio-party');

const conf = require('./conf');
const ban = require('./ban');
const dbs = require('./db');
const profdb = dbs('profile');
const bandb = dbs('bans');
const utils = require('./utils');

let tp = new TP(conf.get('twilioSID'), conf.get('twilioToken'),
                conf.get('twilioNumber'), conf.get('phoneSalt'));
tp.message = 'Here is your BBS pin: ';

let addNewUser = function (uid, phone, request, reply) {
  profdb.put('uid!' + uid, phone, (err) => {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    profdb.put('user!' + phone, {
      uid: uid,
      phone: phone,
      showreplies: true
    }, (err) => {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      request.auth.credentials.uid = uid;
      request.auth.credentials.phone = phone;
      return reply.redirect('/');
    });
  });
};

let register = function (request, reply) {
  let phone = request.auth.credentials.phone;
  console.log('logging in ', phone);

  profdb.get('user!' + phone, (err, user) => {
    if (err || !user) {
      // register new user if signups aren't disabled
      if (conf.get('disableSignups')) {
        return reply.redirect('/no_new_accounts');
      } else {
        const uid = uuid.v4();
        addNewUser(uid, phone, request, reply);
      }
    } else {
      if (conf.get('ops').indexOf(user.uid) > -1) {
        request.auth.credentials.op = true;
      }

      request.auth.credentials.uid = user.uid;
      request.auth.credentials.name = user.name;
      reply.redirect('/');
    }
  });
};

exports.login = function (request, reply) {
  const prehashPhone = request.payload.phone;
  const ip = request.info.remoteAddress;

  if (!ip) {
    return reply(Boom.wrap(new Error('remote ip required'), 400));
  }

  bandb.get(ip, (err) => {
    if (!err) {
      request.cookieAuth.clear();
      return reply(Boom.wrap(new Error('Your number has been banned. Please contact an operator.'), 400));
    }
  });

  tp.addNumber(prehashPhone, (err, formattedPhone) => {
    if (conf.get('disableSignups')) {
      return reply.redirect('/no_new_accounts');
    } else if (err) {
      return reply(Boom.wrap(err, 400));
    }

    // set session phone temporarily to the prehashed one so that we can verify auth later
    request.cookieAuth.set({
      phone: formattedPhone
    });

    reply.redirect('/authenticate');
  });
};

exports.authenticate = function (request, reply) {
  let validated = tp.validatePin(request.auth.credentials.phone, request.payload.pin);

  if (validated) {
    // change session phone # to hashed version.
    request.auth.credentials.phone = validated;
    register(request, reply);
  } else {
    return reply(Boom.wrap(new Error('Invalid pin', 400)));
  }
};

exports.logout = function (request, reply) {
  request.cookieAuth.clear();
  reply.redirect('/');
};
