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
    testPin: fixtures.pin,
    error: request.query.err
  });
};

exports.user = function (request, reply) {
  const uid = request.params.uid;

  let checkBanStatus = function (user, opts) {
    ban.status(user.phone, (err, status) => {
      if (err) {
        status = false;
      }

      let context = {
        firstKey: opts.firstKey,
        lastKey: opts.lastKey,
        next: opts.paginate,
        analytics: ctx.analytics,
        user: user.name,
        banned: status,
        uid: user.uid,
        websites: utils.autoLink(user.websites),
        bio: utils.autoLink(user.bio),
        session: request.auth.credentials.uid,
        posts: opts.posts,
        phone: request.auth.credentials.op ? user.phone : false,
        op: request.auth.credentials.op,
        userOp: conf.get('ops').indexOf(user.uid) > -1 || false
      };

      if (context.session && context.session !== uid) {
        mute.getAll(context.session, (err, data) => {
          if (err || !data) {
            context.muted = false;
          } else if (data[uid]) {
            context.muted = true;
          }
        });

        return reply.view('user', context);
      }

      reply.view('user', context);
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

exports.profile = function (request, reply) {
  let context = {
    error: request.query.err || '',
    session: request.auth.credentials.uid || false,
    op: request.auth.credentials.op || false,
    phone: '',
    analytics: ctx.analytics
  };

  if (request.auth.credentials.phone) {
    profile.get(request.auth.credentials.phone, (err, user) => {
      if (err) {
        return reply(Boom.wrap(err, 404));
      }

      context.user = user;
      reply.view('profile', context);
    });
  } else {
    reply.view('profile', context);
  }
};

exports.privacy = function (request, reply) {
  ctx.session = request.auth.credentials.uid || false;
  reply.view('privacy', ctx);
};

exports.noNewAccounts = function (request, reply) {
  ctx.session = false;
  reply.view('no_new_accounts', ctx);
};
