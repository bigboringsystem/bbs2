'use strict';

const Boom = require('boom');
const concat = require('concat-stream');
const Rss = require('rss');
const conf = require('./conf');

const crypto = require('crypto');
const utils = require('./utils');
const url = require('url');

const MAX_POSTS = 10;

const db = require('./db').register('posts');
const profile = require('./profile');

let internalLinkRe = function () {
  const key = '(post![0-9]+-[0-9a-f]+|user![0-9a-f-]{36}![0-9]+-[0-9a-f]+)';
  const pattern = 'https?://[^/\\s]+/post/' + key;
  return new RegExp(pattern);
};

// find replies that look like links to other posts in the system.
// to be "internal" must have this hostname.  If they're actually
// valid posts, then we track stuff.  If not, then we don't bother.
let getInternalLinks = function (reply, host) {
  if (!host) {
    return false;
  }

  reply = reply.trim();
  if (!reply) {
    return false;
  }

  let urls = reply.trim().split(/\s+/);

  let internalLinks = urls.map((r) => {
    var parsed = r.match(internalLinkRe());
    if (!parsed) {
      return false;
    }

    let u = url.parse(parsed[0]);
    if (u.host === host) {
      // internal link.  Just save the postid.
      return parsed[1].replace(/^(post!|user![^!]+!)(.*)$/, '$2');
    }

    return false;
  }).filter((r) => {
    return r;
  });

  return internalLinks;
};

let saveReply = function (postItem, next) {
  if (!postItem.replyto) {
    return process.nextTick(next);
  }

  let count = postItem.replyto.length;
  if (!count) {
    return process.nextTick(next);
  }

  let postid = postItem.postid;

  let error;
  let then = function (err) {
    if (err) {
      error = err;
    }

    if (--count <= 0) {
      // filter out any replyto entries that were invalid.
      postItem.replyto = postItem.replyto.filter((rt) => {
        return rt;
      });

      return next(error);
    }
  };

  postItem.replyto.forEach((target, index) => {
    let replyItem = {
      uid: postItem.uid,
      name: postItem.name,
      created: postItem.created,
      postid: postid,
      target: target
    };

    db.get('post!' + target, (err, targetPost) => {
      if (err) {
        // invalid replyto.  skip, and mark for deletion once we're done.
        postItem.replyto[index] = false;
        return then();
      }

      if (!targetPost.showreplies) {
        postItem.replyto[index] = false;
        return then();
      }

      db.put('replyto!' + target + '!' + postid, replyItem, (err) => {
        then(err);
      });
    });
  });
};

exports.add = function (request, reply) {
  const time = new Date();
  const uid = request.auth.credentials.uid;
  const name = request.auth.credentials.name;

  profile.get(request.auth.credentials.phone, (errUser) => {
    if (errUser) {
      return reply.redirect('/logout');
    }

    if (!uid) {
      return reply.redirect('/');
    }

    if (!name) {
      return reply.redirect('/profile');
    }

    if (!request.payload.content) {
      let err = new Error('You must include content with your post');
      return reply(Boom.wrap(err, 400));
    }

    const host = request.headers.host;

    let postItem = {
      uid: uid,
      name: name,
      created: time.toISOString(),
      replyto: getInternalLinks(request.payload.reply, host),
      reply: utils.autoLink(request.payload.reply) || '',
      content: utils.autoLink(request.payload.content, {
        htmlEscapeNonEntities: true,
        targetBlank: true
      }),
      showreplies: request.payload.showreplies === 'on'
    };

    const postid = Math.floor(time / 1000) + '-' + crypto.randomBytes(1).toString('hex');

    let done = function (err) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }
      reply.redirect('/posts');
    };

    let savePost = function () {
      db.put('user!' + request.auth.credentials.uid + '!' + postid, postItem, (err) => {
        if (err) {
          return done(err);
        }

        db.put('post!' + postid, postItem, (err) => {
          if (err) {
            return done(err);
          }

          saveReply(postItem, (err) => {
            if (err) {
              return done(err);
            }

            reply.redirect('/posts');
          });
        });
      });
    };

    let getId = function () {
      db.get('post!' + postid, (er, result) => {
        if (result && postid.length > (time.length + 8)) {
          return reply(Boom.wrap('please try later', 503));
        }

        if (result) {
          postid += crypto.randomBytes(1).toString('hex');
          return getId();
        }

        postItem.postid = postid;
        return savePost();
      });
    };

    getId();
  });
};

let setPagination = function (defaultKey, request, next) {
  let key;
  let cs = db.createKeyStream({
    gte: defaultKey,
    limit: 1
  });

  cs.on('error', (err) => {
    return next(err);
  });

  cs.on('data', (data) => {
    key = data;
  });

  cs.on('end', () => {
    let streamOpt = {
      gte: defaultKey,
      limit: MAX_POSTS,
      reverse: true
    };

    if (request.query.last) {
      streamOpt.lt = request.query.last;
    } else {
      streamOpt.lte = defaultKey + '\xff';
    }

    return next(null, {
      stream: streamOpt,
      finalKey: key
    });
  });
};

exports.getRss = function (request, reply) {
  let feed = new Rss({
    title: 'bbs'
  });

  setPagination('post!', request, function (err, streamOpt) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    var rs = db.createReadStream(streamOpt.stream);
    var domain = conf.get('publicDomain') || 'bbs.revolting.me';

    var port = '';

    if (process.env.NODE_ENV !== 'production') {
      port = ':' + conf.get('port');
    }

    rs.pipe(concat((posts) => {
      posts.map((post) => {
        let p = post.value;

        feed.item({
            title: p.created,
            description: p.content,
            url: request.server.info.protocol + '://' + domain + port + '/post/post!' + p.postid,
            author: p.name,
            date: p.created
        });

      });

      return reply(feed.xml()).header('Content-type', 'application/xml');
    }));

    rs.on('error', (err) => {
      return reply(Boom.wrap(err, 400));
    });
  });
};

exports.getAllRecent = function (request, reply) {
  let session = false;

  if (request.auth.isAuthenticated) {
    session = request.auth.credentials.uid;
  }

  setPagination('post!', request, (err, streamOpt) => {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    let rs = db.createReadStream(streamOpt.stream);

    rs.pipe(concat((posts) => {
      let firstKey = false;
      let lastKey = false;

      if (posts.length) {
        firstKey = posts[0].key;
        lastKey = posts[posts.length - 1].key;
      }

      return reply.view('discover', {
        firstKey: firstKey,
        lastKey: lastKey,
        next: (streamOpt.finalKey !== lastKey),
        analytics: conf.get('analytics'),
        session: session,
        posts: posts
      });
    }));

    rs.on('error', (err) => {
      return reply(Boom.wrap(err, 400));
    });
  });
};

exports.getAllByUser = function (uid, next) {
  let rs = db.createReadStream({
    gte: 'user!' + uid,
    lte: 'user!' + uid + '\xff'
  });

  let getFeedPost = function (uid, posts, next) {
    let feedArr = [];
    let count = 0;

    if (posts.length < 1) {
      return next(null, []);
    }

    posts.forEach((post) => {
      let postid = post.key.split('!')[2];

      let fs = db.createReadStream({
        gte: 'post!' + postid,
        lte: 'post!' + postid + '\xff'
      });

      fs.pipe(concat((feed) => {
        feed.forEach((fd) => {
          count++;

          if (fd.value.uid === uid) {
            feedArr.push(fd);
          }

          if (count === feed.length) {
            return next(null, feedArr);
          }
        });
      }));

      fs.on('error', (err) => {
        return next(err);
      });
    });
  };

  rs.pipe(concat((posts) => {
    getFeedPost(uid, posts, (err, feed) => {
      if (err) {
        return next(Boom.wrap(err, 400));
      }

      return next(null, {
        feed: feed,
        posts: posts
      });
    });
  }));

  rs.on('error', (err) => {
    return next(Boom.wrap(err, 400));
  });
};

exports.getRecent = function (request, reply) {
  const uid = request.auth.credentials.uid;

  profile.getByUID(uid, (err, user) => {
    if (err) {
      // This would mean that the user's acct has been deleted
      // so we should just not show this page anyway.
      return reply.redirect('/logout');
    }

    setPagination('user!' + uid + '!', request, (err, streamOpt) => {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      let rs = db.createReadStream(streamOpt.stream);

      rs.pipe(concat((posts) => {
        let firstKey = false;
        let lastKey = false;

        if (posts.length) {
          firstKey = posts[0].key;
          lastKey = posts[posts.length - 1].key;
        }

        return reply.view('posts', {
          firstKey: firstKey,
          lastKey: lastKey,
          next: (streamOpt.finalKey !== lastKey),
          analytics: conf.get('analytics'),
          session: uid,
          posts: posts,
          user: user
        });
      }));

      rs.on('error', (err) => {
        return reply(Boom.wrap(err, 400));
      });
    });
  });
};

exports.getRecentForUser = function (uid, request, next) {
  setPagination('user!' + uid + '!', request, (err, streamOpt) => {
    if (err) {
      return next(err);
    }

    let rs = db.createReadStream(streamOpt.stream);

    rs.pipe(concat((posts) => {
      let firstKey = false;
      let lastKey = false;

      if (posts.length) {
        firstKey = posts[0].key;
        lastKey = posts[posts.length - 1].key;
      }

      next(null, {
        firstKey: firstKey,
        lastKey: lastKey,
        paginate: (streamOpt.finalKey !== lastKey),
        posts: posts
      });
    }));

    rs.on('error', (err) => {
      next(err);
    });
  });
};

exports.delReply = function (request, reply) {
  if (request.auth.credentials.uid === request.payload.uid || request.auth.credentials.op) {
    const uid = request.payload.uid;
    const op = request.auth.credentials.op;

    let key = request.params.key;
    let keyArr = key.split('!');

    if (keyArr[0] !== 'replyto') {
      return reply(Boom.wrap, new Error('not found'), 404);
    }

    let target = keyArr[1];

    // verify that either the user is an op, or is the owner
    // of the target post.
    db.get('post!' + target, (err, postItem) => {
      if (err) {
        return reply(Boom.wrap, err, 404);
      }

      if (!op && postItem.uid !== uid) {
        return reply(Boom.wrap, new Error('forbidden'), 403);
      }

      db.del(key, (err) => {
        if (err) {
          return reply(Boom.wrap, err, 400);
        }
        reply.redirect('/post/post!' + target);
      });
    });
  } else {
    reply.redirect('/');
  }
};

exports.del = function (request, reply) {
  if (request.auth.credentials.uid === request.payload.uid || request.auth.credentials.op) {
    let deleteKeys = function (keys) {
      const len = keys.length;

      if (len === 0) {
        return reply.redirect('/posts');
      }

      let next = function (err) {
        if (err) {
          return reply(Boom.wrap, err, 404);
        }
        reply.redirect('/posts');
      };

      let error = false;

      keys.forEach((key) => {
        db.del(key, (err) => {
          if (err) {
            error = err;
          }

          if (--len <= 0) {
            next(error);
          }
        });
      });
    };

    let keyArr = request.params.key.split('!');
    let postid = keyArr[keyArr.length - 1];

    // get the post data first.
    db.get('post!' + postid, (err, post) => {
      if (err) {
        return reply(Boom.wrap, err, 404);
      }

      if (post.uid !== request.payload.uid) {
        return reply(Boom.wrap, new Error('forbidden'), 403);
      }

      let keys = [
        'post!' + postid,
        'user!' + post.uid + '!' + postid
      ];

      if (post.replyto && post.replyto.length) {
        post.replyto.forEach((target) => {
          keys.push('replyto!' + target + '!' + postid);
        });
      }

      let ks = db.createKeyStream({
        gte: 'replyto!' + postid,
        lte: 'replyto!' + postid + '\xff'
      });

      ks.on('data', (key) => {
        keys.push(key);
      });

      let hadError = false;

      ks.on('error', (err) => {
        hadError = true;
        reply(Boom.wrap, err, 500);
      });

      ks.on('end', () => {
        if (hadError) {
          return;
        }
        deleteKeys(keys);
      });
    });
  } else {
    reply.redirect('/');
  }
};

let getReplyPosts = function (post, next) {
  let streamOpt = {
    gte: 'replyto!' + post.postid,
    lte: 'replyto!' + post.postid + '\xff'
  };

  let replies = [];
  let rs = db.createReadStream(streamOpt);

  rs.on('data', (reply) => {
    let val = reply.value;
    let key = reply.key;

    let replyid = key.match(/^replyto![^!]+!([^!]+)$/);
    if (!replyid) {
      return;
    }
    replyid = replyid[1];
    if (!replyid) {
      return;
    }

    replies.push(val);
  });

  rs.on('end', () => {
    next(null, replies);
  });

  rs.on('error', next);
};

exports.get = function (request, reply) {
  // redirect /post/user!<uid>!<postid> to /post/post!<postid>
  let key = request.params.key;
  let keyparts = key.split('!');
  let postid = keyparts.pop();

  if (keyparts.length !== 1 || keyparts[0] !== 'post') {
    return reply.redirect('/post/post!' + postid).permanent();
  }

  db.get('post!' + postid, (err, post) => {
    if (err) {
      return reply(Boom.wrap(err, 404));
    }

    getReplyPosts(post, (err, replies) => {
      if (err) {
        return reply(Boom.wrap(err, 404));
      }

      post.replies = replies;

      reply.view('post', {
        analytics: conf.get('analytics'),
        id: request.params.key,
        session: request.auth.credentials.uid || false,
        op: request.session.get('op'),
        post: post
      });
    });
  });
};
