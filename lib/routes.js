'use strict';

const Joi = require('joi');

const services = require('./services');
const profile = require('./profile');
const posts = require('./posts');
const auth = require('./auth');
const mute = require('./mute');

const authSession = {
  mode: 'try',
  strategy: 'session'
};

exports.routes = [
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
    config: {
      handler: services.authenticate,
      auth: authSession
    }
  },
  {
    method: 'GET',
    path: '/privacy',
    handler: services.privacy
  },
  {
    method: 'POST',
    path: '/authenticate',
    config: {
      handler: auth.authenticate,
      auth: authSession,
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
    method: ['GET', 'POST'],
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
