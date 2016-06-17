'use strict';

const Hapi = require('hapi');
const conf = require('./lib/conf');
const http = require('http');
const Boom = require('boom');
const Blankie = require('blankie');
const Scooter = require('scooter');

const { routes } = require('./lib/routes');

const server = new Hapi.Server();

server.connection({
  host: conf.get('domain'),
  port: conf.get('port')
});

server.register([Scooter,
  {
    register: Blankie,
    options: {
      defaultSrc: ['self', 'https://www.youtube.com'],
      connectSrc: ['ws:', 'wss:', 'self'],
      imgSrc: ['self', 'data:'],
      scriptSrc: 'self',
      styleSrc: ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
      fontSrc: ['self', 'https://fonts.gstatic.com'],
      mediaSrc: ['self', 'blob:'],
      generateNonces: false
    }
  }
], (err) => {
  if (err) {
    return console.log(err);
  }
});

server.register(require('hapi-auth-cookie'), (err) => {
  if (err) {
    throw err;
  }

  server.auth.strategy('session', 'cookie', {
    password: conf.get('password'),
    ttl: conf.get('session-ttl'),
    cookie: conf.get('cookie'),
    keepAlive: true,
    isSecure: process.env.node === 'production'
  });
});

server.register([
  {
    register: require('vision')
  },
  {
    register: require('inert')
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

server.ext('onPreResponse', (request, reply) => {
  let response = request.response;
  if (!response.isBoom) {
    if (['/ban', '/unban'].indexOf(request.path) > -1) {
      if (!!request.auth.credentials.op === false) {
        return reply.redirect('/');
      }
    }

    return reply.continue();
  }

  let error = response;
  let ctx = {};

  let message = error.output.payload.message;
  let statusCode = error.output.statusCode || 500;
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

  if (process.env.node !== 'production') {
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
