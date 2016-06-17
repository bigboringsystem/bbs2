'use strict';

const conf = require('./conf');
const Boom = require('boom');

const profile = require('./profile');
const posts = require('./posts');
const ban = require('./ban');
const mute = require('./mute');
const utils = require('./utils');

let ctx = {
  analytics: conf.get('analytics')
};

exports.home = function (request, reply) {
  ctx.error = request.query.err || '';
  ctx.session = false;

  if (request.auth.isAuthenticated) {
    ctx.session = request.auth.credentials.uid;
  }

  ctx.ops = conf.get('ops') || {};
  ctx.disableSignups = conf.get('disableSignups') || false;

  if (ctx.ops.length > 0) {
    let count = 0;
    let users = {};

    ctx.ops.forEach((op) => {
      profile.getByUID(op, (err, user) => {
        count++;

        if (!err && user) {
          users[op] = {
            uid: op,
            name: user.name
          };
        }
        if (count === ctx.ops.length) {
          ctx.ops = users;
          reply.view('index', ctx);
        }
      });
    });
  } else {
    reply.view('index', ctx);
  }
};

exports.links = function (request, reply) {
  ctx.session = request.auth.credentials.uid || false;
  reply.view('links', ctx);
};

exports.messages = function (request, reply) {
  ctx.session = request.auth.credentials.uid || false;
  reply.view('messages', ctx);
};

exports.authenticate = function (request, reply) {
  reply.view('authenticate', {
    error: request.query.err
  });
};

exports.user = function (request, reply) {
  const uid = request.params.uid;

  const checkBanStatus = function (user, opts) {
    ban.status(user.phone, (err, status) => {
      if (err) {
        status = false;
      }

      let uid = false;
      let op = false;

      if (request.auth.isAuthenticated) {
        uid = request.auth.credentials.uid;
        op = request.auth.credentials.op;
      }

      let ctx = {
        firstKey: opts.firstKey,
        lastKey: opts.lastKey,
        next: opts.paginate,
        analytics: conf.get('analytics'),
        user: user.name,
        banned: status,
        uid: user.uid,
        websites: utils.autoLink(user.websites),
        hex: 'background-color: ' + (user.hex || '#F1F1F1'),
        bio: utils.autoLink(user.bio),
        session: uid,
        posts: opts.posts,
        phone: op ? user.phone : false,
        op: op,
        userOp: conf.get('ops').indexOf(user.uid) > -1 || false
      };

      if (ctx.session && ctx.session !== uid) {
        mute.getAll(ctx.session, (err, data) => {
          if (err || !data) {
            ctx.muted = false;
          } else if (data[uid]) {
            ctx.muted = true;
          }
        });

        return reply.view('user', ctx);
      }

      reply.view('user', ctx);
    });
  };

  profile.getByUID(uid, (err, user) => {
    if (err) {
      return reply(Boom.wrap(err, 404));
    }

    posts.getRecentForUser(uid, request, (err, opts) => {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      checkBanStatus(user, opts);
    });
  });
};

exports.privacy = function (request, reply) {
  ctx.session = false;

  if (request.auth.isAuthenticated) {
    ctx.session = request.auth.credentials.uid;
  }

  reply.view('privacy', ctx);
};

exports.noNewAccounts = function (request, reply) {
  ctx.session = false;
  reply.view('no_new_accounts', ctx);
};
