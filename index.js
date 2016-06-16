'use strict';

const Hapi = require('hapi');
const conf = require('./lib/conf');
const http = require('http');
const Boom = require('boom');
const Joi = require('joi');
const Blankie = require('blankie');
const Scooter = require('scooter');
const Inert = require('inert');

const services = require('./lib/services');
const profile = require('./lib/profile');
const auth = require('./lib/auth');
const mute = require('./lib/mute');

const posts = require('./lib/posts');
const utils = require('./lib/utils');

const server = new Hapi.Server();

server.connection({
  host: conf.get('domain'),
  port: conf.get('port')
});

server.register([Scooter,
  {
    register: Blankie,
    options: {
      defaultSrc: 'self',
      connectSrc: ['ws:', 'wss:', 'self'],
      imgSrc: ['self', 'data:'],
      scriptSrc: 'self',
      styleSrc: 'self',
      fontSrc: 'self',
      mediaSrc: ['self', 'blob:'],
      generateNonces: false
    }
  }
], (err) => {
  if (err) {
    return console.log(err);
  }
});

let authSession = {
  mode: 'try',
  strategy: 'session'
};

server.register(require('hapi-auth-cookie'), (err) => {
  if (err) {
    throw err;
  }

  server.auth.strategy('session', 'cookie', {
    password: conf.get('password'),
    ttl: conf.get('session-ttl'),
    cookie: conf.get('cookie'),
    keepAlive: true,
    isSecure: false,
    redirectTo: '/'
  });
});

server.register([
  {
    register: Inert
  },
  {
    register: require('vision')
  },
  {
    register: require('crumb')
  },
  {
    register: require('hapi-cache-buster'),
    options: new Date().getTime().toString()
  }
], (err) => {
  if (err) {
    console.log(err);
  }

  server.views({
    engines: {
      pug: require('pug')
    },
    isCached: process.env.node === 'production',
    path: __dirname + '/views',
    compileOptions: {
      pretty: true
    }
  });
});

const routes = [
  {
    method: 'GET',
    path: '/',
    handler: services.home
  },
  {
    method: 'GET',
    path: '/user',
    handler: function (request, reply) {
      reply({
        name: request.session.get('name'),
        uid: request.session.get('uid')
      });
    }
  },
  {
    method: 'GET',
    path: '/links',
    config: {
      handler: services.links,
      auth: authSession
    }
  },
  {
    method: 'GET',
    path: '/users',
    config: {
      handler: profile.getAllUsers,
      auth: authSession
    }
  },
  {
    method: 'GET',
    path: '/messages',
    config: {
      handler: services.messages,
      auth: authSession
    }
  },
  {
    method: 'GET',
    path: '/posts',
    config: {
      handler: posts.getRecent,
      auth: authSession
    }
  },
  {
    method: 'GET',
    path: '/discover',
    handler: posts.getAllRecent
  },
  {
    method: 'GET',
    path: '/rss',
    handler: posts.getRss
  },
  {
    method: 'GET',
    path: '/login',
    handler: services.home
  },
  {
    method: 'GET',
    path: '/authenticate',
    handler: services.authenticate
  },
  {
    method: 'GET',
    path: '/privacy',
    handler: services.privacy
  },
  {
    method: 'POST',
    path: '/authenticate',
    handler: auth.authenticate,
    config: {
      validate: {
        payload: {
          pin: Joi.number().integer()
        }
      }
    }
  },
  {
    method: 'POST',
    path: '/login',
    handler: auth.login,
    config: {
      validate: {
        payload: {
          phone: Joi.string().regex(/^\+?[0-9]+$/).min(10).max(15).options({
            language: {
              label: 'phone number'
            }
          })
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/logout',
    config: {
      handler: auth.logout,
      auth: authSession
    }
  },
  {
    method: 'GET',
    path: '/user/{uid}',
    handler: services.user
  },
  {
    method: 'GET',
    path: '/profile',
    config: {
      handler: services.profile,
      auth: authSession
    }
  },
  {
    method: 'POST',
    path: '/profile',
    handler: profile.update,
    config: {
      validate: {
        payload: {
          name: Joi.string().min(2).max(30),
          websites: Joi.string().allow(''),
          bio: Joi.string().allow(''),
          showreplies: Joi.string().allow('')
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/add_phone',
    handler: services.profile
  },
  {
    method: 'POST',
    path: '/add_phone',
    handler: profile.addPhone,
    config: {
      validate: {
        payload: {
          phone: Joi.string().regex(/^\+?[0-9]+$/).min(10).max(16).options({
            language: {
              label: 'phone number'
            }
          }),
          pin: Joi.number().integer().optional()
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/post/{key}',
    handler: posts.get
  },
  {
    method: 'POST',
    path: '/post',
    config: {
      handler: posts.add,
      auth: authSession
    }
  },
  {
    method: 'GET',
    path: '/ban',
    config: {
      handler: profile.ban,
      auth: authSession
    }
  },
  {
    method: 'POST',
    path: '/ban',
    config: {
      handler: profile.ban,
      auth: authSession
    }
  },
  {
    method: 'POST',
    path: '/unban',
    config: {
      handler: profile.unban,
      auth: authSession
    }
  },
  {
    method: 'POST',
    path: '/post/{key}',
    config: {
      handler: posts.del,
      auth: authSession
    }
  },
  {
    method: 'POST',
    path: '/reply/{key}',
    config: {
      handler: posts.delReply,
      auth: authSession
    }
  },
  {
    method: 'POST',
    path: '/deleteaccount',
    config: {
      handler: profile.deleteAccount,
      auth: authSession
    }
  },
  {
    method: 'GET',
    path: '/no_new_accounts',
    handler: services.noNewAccounts
  },
  {
    method: 'POST',
    path: '/mute',
    config: {
      handler: mute.set,
      auth: authSession
    }
  },
  {
    method: 'POST',
    path: '/unmute',
    config: {
      handler: mute.unset,
      auth: authSession
    }
  }
];

server.route(routes);

server.route({
  path: '/{p*}',
  method: 'GET',
  handler: {
    directory: {
      path: './public',
      listing: false,
      index: false
    }
  }
});

server.ext('onPreResponse', function (request, reply) {
  var response = request.response;
  if (!response.isBoom) {
    if (['/ban', '/unban'].indexOf(request.path) > -1) {
      if (!!request.session.get('op') === false) {
        return reply.redirect('/');
      }
    }

    return reply.continue();
  }

  var error = response;
  var ctx = {};

  var message = error.output.payload.message;
  var statusCode = error.output.statusCode || 500;
  ctx.code = statusCode;
  ctx.httpMessage = http.STATUS_CODES[statusCode].toLowerCase();

  switch (statusCode) {
    case 404:
      ctx.reason = 'page not found';
      break;
    case 403:
      ctx.reason = 'forbidden';
      break;
    case 500:
      ctx.reason = 'something went wrong';
      break;
    default:
      break;
  }

  if (process.NODE_ENV !== 'production') {
    console.log(error.stack || error);
  }

  if (ctx.reason) {
    // Use actual message if supplied
    ctx.reason = message || ctx.reason;
    return reply.view('error', ctx).code(statusCode);
  } else {
    ctx.reason = message.replace(/\s/gi, '+');
    reply.redirect(request.path + '?err=' + ctx.reason);
  }
});

server.start((err) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }

  console.log('\n  b.b.s. server running at ' + server.info.uri + '  \n');
});
