'use strict';

const Boom = require('boom');

const db = require('./db').register('mutes');

exports.set = function (request, reply) {
  const self = request.auth.credentials.uid;
  const them = request.payload.uid;

  if (self === them) {
    return reply.redirect('/user/' + them);
  }

  db.get('mute!' + self, (err, data) => {
    if (err || !data) {
      data = {};
    }

    data[them] = them;

    db.put('mute!' + self, data, (err) => {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      return reply.redirect('/user/' + them);
    });
  });
};

exports.unset = function (request, reply) {
  const self = request.auth.credentials.uid;
  const them = request.payload.uid;

  if (self === them) {
    return reply.redirect('/user/' + them);
  }

  db.get('mute!' + self, (err, data) => {
    if (err || !data) {
      data = {};
    }

    delete data[them];

    db.put('mute!' + self, data, (err) => {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      return reply.redirect('/user/' + them);
    });
  });
};

exports.getAll = function (self, next) {
  db.get('mute!' + self, (err, data) => {
    if (err || !data) {
      return next(null, {});
    }

    return next(null, data);
  });
};
