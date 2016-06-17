'use strict';

const Boom = require('boom');
const Hoek = require('hoek');
const concat = require('concat-stream');
const conf = require('./conf');

const dbs = require('./db');
const db = dbs.register('profile');

const posts = require('./posts');
const postdb = dbs('posts');

const services = require('./services');
const utils = require('./utils');
const ban = require('./ban');

exports.update = function (request, reply) {
  const phone = request.auth.credentials.phone;

  db.get('user!' + phone, (err, user) => {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    let name = Hoek.escapeHtml(request.payload.name.trim());

    if (!name || name && name.length < 2) {
      name = '???';
    }

    let hex = request.payload.hex || '';

    if (!hex.match(/^#[A-Z0-9]+$/i)) {
      if (hex.match(/^[A-Z0-9]+$/i)) {
        hex = '#' + hex;
      } else {
        hex = '#F1F1F1';
      }
    }

    let userData = {
      name: name,
      websites: request.payload.websites,
      bio: request.payload.bio,
      hex: hex,
      showreplies: request.payload.showreplies === 'on',
      phone: phone
    };

    user = utils.merge(user, userData);

    db.put('user!' + phone, user, (err) => {
      if (err) {
        reply(Boom.wrap(err, 400));
      } else {
        request.auth.credentials.name = user.name;
        request.auth.credentials.hex = user.hex;
        exports.profile(request, reply, user);
      }
    });
  });
};

exports.get = function (phone, next) {
  db.get('user!' + phone, (err, user) => {
    if (err) {
      return next(err);
    }

    next(null, user);
  });
};

exports.profile = function (request, reply) {
  let ctx = {
    error: request.query.err || '',
    session: request.auth.credentials.uid || false,
    op: request.auth.credentials.op || false,
    hex: request.auth.credentials.hex || '#F1F1F1',
    phone: '',
    analytics: conf.get('analytics')
  };

  if (request.auth.credentials.phone) {
    exports.get(request.auth.credentials.phone, (err, user) => {
      if (err) {
        return reply(Boom.wrap(err, 404));
      }

      ctx.user = user;
      reply.view('profile', ctx);
    });
    return;
  }

  reply.view('profile', ctx);
};

exports.ban = function (request, reply) {
  ban.hammer(request.payload.phone, (err) => {
    if (err) {
      reply(Boom.wrap(err, 400));
    }

    reply.redirect('/user/' + request.payload.uid);
  });
};

exports.unban = function (request, reply) {
  ban.unhammer(request.payload.phone, (err) => {
    if (err) {
      reply(Boom.wrap(err, 400));
    }

    reply.redirect('/user/' + request.payload.uid);
  });
};

exports.getAllUsers = function (request, reply) {
  let uid = false;

  if (request.auth.isAuthenticated) {
    uid = request.auth.credentials.uid;
  }

  let rs = db.createReadStream({
    gte: 'user!',
    lte: 'user!\xff'
  });

  rs.pipe(concat((users) => {
    return reply.view('users', {
      analytics: conf.get('analytics'),
      session: uid,
      users: users.map((user) => {
        if (conf.get('ops').indexOf(user.value.uid) > -1) {
          user.op = true;
        }

        return user;
      })
    });
  }));

  rs.on('error', (err) => {
    return reply(Boom.wrap(err, 400));
  });
};

exports.getByUID = function (uid, next) {
  db.get('uid!' + uid, (err, phone) => {
    if (err) {
      return next(err);
    }

    db.get('user!' + phone, (err, user) => {
      if (err) {
        return next(err);
      }

      next(null, user);
    });
  });
};

let deletePostsAndUser = function (all, user, next) {
  let batch = [];

  all.posts.forEach((post) => {
    batch.push({
      type: 'del',
      key: post.key
    });
  });

  all.feed.forEach((fd) => {
    batch.push({
      type: 'del',
      key: fd.key
    });
  });

  postdb.batch(batch, (err) => {
    if (err) {
      return next(err);
    }

    batch = [];

    batch.push({
      type: 'del',
      key: 'user!' + user.phone
    });

    batch.push({
      type: 'del',
      key: 'uid!' + user.uid
    });

    db.batch(batch, (err) => {
      if (err) {
        return next(err);
      }

      next(null, true);
    });
  });
};

exports.deleteAccount = function (request, reply) {
  if (request.auth.credentials.op) {
    // delete posts and account
    const uid = request.payload.uid;

    posts.getAllByUser(uid, (err, all) => {
      if (err) {
        return reply(Boom.wrap(err, 500));
      }

      exports.getByUID(uid, (err, user) => {
        if (err) {
          return reply(Boom.wrap(err, 500));
        }

        deletePostsAndUser(all, user, (err) => {
          if (err) {
            return reply(Boom.wrap(err, 500));
          }

          reply.redirect('/users');
        });
      });
    });
  } else {
    reply.redirect('/');
  }
};
