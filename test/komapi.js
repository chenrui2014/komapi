// Dependencies
import test from 'ava';
import { agent as request } from 'supertest';
import knex from 'knex';
import path from 'path';
import os from 'os';
import uuid from 'uuid';
import Komapi from '../src/index';
import DummyLogger from './fixtures/dummyLogger';
import User from './fixtures/models/User';
import Permission from './fixtures/models/Permission';
import Role from './fixtures/models/Role';
import router from './fixtures/routes';

// Init
const connection = {
  client: 'sqlite3',
  useNullAsDefault: true,
  connection: {
    filename: ':memory:',
  },
};

// Tests
test('accepts default development configuration', async (t) => {
  t.plan(4);
  let app;
  delete process.env.NODE_ENV;
  t.notThrows(() => {
    app = new Komapi();
  });
  app.use((ctx) => {
    t.false(ctx.state.cache);
  });
  await request(app.listen())
    .get('/');
  t.is(app.env, 'development');
  t.is(app.log.streams.length, 0);
});
test('accepts default production configuration', async (t) => {
  t.plan(4);
  let app;
  t.notThrows(() => {
    app = new Komapi({ env: 'production' });
  });
  app.use((ctx) => {
    t.true(ctx.state.cache);
  });
  await request(app.listen())
    .get('/');
  t.is(app.env, 'production');
  t.is(app.log.streams.length, 0);
});
test('env defaults to development for NODE_ENV=development', async (t) => {
  t.plan(2);
  let app;
  process.env.NODE_ENV = 'development';
  t.notThrows(() => {
    app = new Komapi({ loggers: [] });
  });
  t.is(app.env, 'development');
});
test('env defaults production for NODE_ENV=production', async (t) => {
  t.plan(2);
  let app;
  process.env.NODE_ENV = 'production';
  t.notThrows(() => {
    app = new Komapi({ loggers: [] });
  });
  t.is(app.env, 'production');
});
test('throws on invalid configuration', async (t) => {
  t.throws(() => new Komapi({
    env: 'invalidEnvironment',
    proxy: 'stringvalue',
  }), /("env" must be one of \[development, production])/);
});
test('supports loggers without name', async (t) => {
  t.plan(2);
  let app;
  t.notThrows(() => {
    app = new Komapi({
      loggers: [{
        level: 'info',
        type: 'raw',
        stream: new DummyLogger(),
      }],
    });
  });
  t.notThrows(() => {
    app.log.addStream({
      level: 'info',
      type: 'raw',
      stream: new DummyLogger(),
    });
  });
});
test('can listen to a pipe and logs it', async (t) => {
  t.plan(4);
  // Listen to a named pipe on windows
  const socket = process.platform === 'win32'
    ? path.join('\\\\?\\pipe', process.cwd(), `komapiTestPipe.${uuid.v4()}`)
    : path.join(os.tmpdir(), `komapiTestPipe.${uuid.v4()}.sock`);
  const app = new Komapi({
    loggers: [{
      name: 'DummyLogger',
      level: 'info',
      type: 'raw',
      stream: new DummyLogger((obj) => {
        t.is(obj.bindType, 'pipe');
        t.is(obj.port, null);
        t.is(obj.address, socket);
        t.is(obj.level, 30);
      }),
    }],
  });
  await request(app.listen(socket));
});
test('maps Komapi config to Koa config properties', async (t) => {
  const initialConfig = {
    env: 'production',
    name: 'testname',
    proxy: true,
    subdomainOffset: 3,
  };
  const app = new Komapi(initialConfig);

  // Check
  Object.keys(initialConfig).forEach((i) => {
    t.is(app[i], initialConfig[i]);
    t.is(app.config[i], initialConfig[i]);
  });
});
test('allows Koa config properties to be set directly and be visible through the Koa properties and the Komapi config object ', async (t) => {
  const initialConfig = {
    env: 'production',
    name: 'testname',
    proxy: true,
    subdomainOffset: 3,
  };
  const modifiedConfig = {
    env: 'development',
    name: 'anothertestname',
    proxy: false,
    subdomainOffset: 1,
  };
  const app = new Komapi(initialConfig);

  // Check
  Object.keys(modifiedConfig).forEach((i) => {
    app[i] = modifiedConfig[i];
    t.is(app[i], modifiedConfig[i]);
    t.is(app.config[i], modifiedConfig[i]);
  });
});
test('allows config properties to be set on the Komapi config object and be visible through the Koa properties and the Komapi config object', async (t) => {
  const initialConfig = {
    env: 'production',
    name: 'testname',
    proxy: true,
    subdomainOffset: 3,
  };
  const modifiedConfig = {
    env: 'development',
    name: 'anothertestname',
    proxy: false,
    subdomainOffset: 1,
  };
  const app = new Komapi(initialConfig);

  // Check
  Object.keys(modifiedConfig).forEach((i) => {
    app.config[i] = modifiedConfig[i];
    t.is(app[i], modifiedConfig[i]);
    t.is(app.config[i], modifiedConfig[i]);
  });
});
test('accepts a 2nd user config parameter that is set to app.locals', async (t) => {
  const userConfig = {
    userConfig: true,
    a: 'b',
  };
  const app = new Komapi(undefined, userConfig);
  t.deepEqual(app.locals, userConfig);
});
test('gives a simple representation of itself through json', async (t) => {
  const app = new Komapi({ loggers: [] });
  const out = app.toJSON();
  t.deepEqual(Object.keys(out), [
    'config',
    'state',
  ]);
  t.is(out.config, app.config);
  t.is(out.state, app.state);
});
test('emits an error event on errors', async (t) => {
  const app = new Komapi({ loggers: [] });
  t.plan(2);
  app.on('error', () => {
    t.pass();
  });
  app.use(() => {
    throw new Error('Uncaught exception');
  });
  const res = await request(app.listen())
    .get('/');
  t.is(res.status, 500);
});
test('logs any emitted errors', async (t) => {
  const app = new Komapi({ loggers: [] });
  t.plan(4);
  app.log.addStream({
    name: 'DummyLogger',
    level: 'info',
    type: 'raw',
    stream: new DummyLogger((obj) => {
      t.is(obj.context, 'application');
      t.is(obj.level, 50);
      t.is(obj.msg, 'Application Error');
      t.is(obj.err.message, 'Dummy Error');
    }),
  });
  app.emit('error', new Error('Dummy Error'));
});
test('logs error stack traces', async (t) => {
  const app = new Komapi({ loggers: [] });
  const err = new Error('Dummy Error');
  const expectedStack = err.stack;
  t.plan(2);
  app.log.addStream({
    name: 'DummyLogger',
    level: 'info',
    type: 'raw',
    stream: new DummyLogger((obj) => {
      t.is(obj.err.message, 'Dummy Error');
      t.deepEqual(obj.err.stack, expectedStack);
    }),
  });
  app.emit('error', err);
});
test('logs error stack traces (array) as array', async (t) => {
  const app = new Komapi({ loggers: [] });
  const err = new Error('Dummy Error');
  const expectedStack = err.stack.split('\n');
  err.stack = expectedStack;
  t.plan(2);
  app.log.addStream({
    name: 'DummyLogger',
    level: 'info',
    type: 'raw',
    stream: new DummyLogger((obj) => {
      t.is(obj.err.message, 'Dummy Error');
      t.deepEqual(obj.err.stack, expectedStack);
    }),
  });
  app.emit('error', err);
});
test('logs uncaught exceptions and exits with a non-zero exit code', async (t) => {
  t.plan(5);
  const listeners = process.listeners('uncaughtException').length;
  const app = new Komapi({ loggers: [] });
  const newListeners = process.listeners('uncaughtException').length;
  const orgExit = process.exit;
  t.is(newListeners, listeners + 1);
  app.log.addStream({
    name: 'DummyLogger',
    level: 'info',
    type: 'raw',
    stream: new DummyLogger((obj) => {
      t.is(obj.context, 'application');
      t.is(obj.level, 60);
      t.is(obj.msg, 'Uncaught Exception Error');
    }),
  });
  process.exit = (code) => {
    process.exit = orgExit;
    t.is(code, 1);
  };
  const handler = process.listeners('uncaughtException')[listeners];
  handler.call(app, new Error('Uncaught Exception'));
});
test('logs unhandled promise rejections and exits with a non-zero exit code', async (t) => {
  t.plan(5);
  const listeners = process.listeners('unhandledRejection').length;
  const app = new Komapi({ loggers: [] });
  const newListeners = process.listeners('unhandledRejection').length;
  const orgExit = process.exit;
  t.is(newListeners, listeners + 1);
  app.log.addStream({
    name: 'DummyLogger',
    level: 'info',
    type: 'raw',
    stream: new DummyLogger((obj) => {
      t.is(obj.context, 'application');
      t.is(obj.level, 60);
      t.is(obj.msg, 'Unhandled Rejected Promise');
    }),
  });
  process.exit = (code) => {
    process.exit = orgExit;
    t.is(code, 1);
  };
  const handler = process.listeners('unhandledRejection')[listeners];
  handler.call(app, new Error('Rejected Promise'), new Promise(() => {}, () => {}));
});
test('logs a warning when using a high number of middlewares', async (t) => {
  const app = new Komapi({ loggers: [] });
  const num = 4000 + 1;
  const defaultmw = app.middleware.length;
  for (let i = 0; i < (num - defaultmw); i += 1) {
    app.use((ctx, next) => next());
  }
  t.plan(2);
  app.log.addStream({
    name: 'DummyLogger',
    level: 'info',
    type: 'raw',
    stream: new DummyLogger((obj) => {
      if (obj.msg === `Komapi was started with ${num} middlewares. Please note that more than 4000 middlewares is not supported and could cause stability and performance issues.`) { // eslint-disable-line max-len
        t.is(obj.context, 'application');
        t.is(obj.level, 40);
      }
    }),
  });
  await request(app.listen())
    .get('/');
});
test('does not provide a default route', async (t) => {
  const app = new Komapi({ loggers: [] });
  const res = await request(app.listen())
    .get('/');
  t.is(res.status, 404);
});
test('provides a helper method (ctx.sendIf) to send the response if found', async (t) => {
  const app = new Komapi({ loggers: [] });
  const reply = { status: 'ok' };
  app.use(ctx => ctx.sendIf(reply));
  const res = await request(app.listen())
    .get('/');
  t.deepEqual(JSON.stringify(res.body), JSON.stringify(reply));
  t.is(res.status, 200);
});
test('provides a helper method (ctx.sendIf) to send the response, statusCode and headers, if found', async (t) => {
  const app = new Komapi({ loggers: [] });
  const reply = { status: 'ok' };
  app.use(ctx => ctx.sendIf(reply, 201, { 'X-TMP': 'TEST' }));
  const res = await request(app.listen())
    .get('/');
  t.deepEqual(JSON.stringify(res.body), JSON.stringify(reply));
  t.is(res.headers['x-tmp'], 'TEST');
  t.is(res.status, 201);
});
test('provides a helper method (ctx.sendIf) to send 404 if the response was not found', async (t) => {
  const app = new Komapi({ loggers: [] });
  const reply = null;
  app.use(ctx => ctx.sendIf(reply));
  const res = await request(app.listen())
    .get('/');
  t.is(res.status, 404);
});
test('provides a helper method (ctx.sendIf) to send 404 based on custom evaluation expression', async (t) => {
  const app = new Komapi({ loggers: [] });
  const reply = { data: null };
  app.use(ctx => ctx.sendIf(reply, undefined, undefined, reply.data !== null));
  const res = await request(app.listen())
    .get('/');
  t.is(res.status, 404);
});
test('provides a helper method (ctx.send) to send the response', async (t) => {
  const app = new Komapi({ loggers: [] });
  const reply = { status: 'ok' };
  app.use(ctx => ctx.send(reply));
  const res = await request(app.listen())
    .get('/');
  t.deepEqual(JSON.stringify(res.body), JSON.stringify(reply));
  t.is(res.status, 200);
});
test('provides a helper method (ctx.send) to send the response, statusCode and headers', async (t) => {
  const app = new Komapi({ loggers: [] });
  const reply = null;
  app.use(ctx => ctx.send(reply, 201, { 'X-TMP': 'TEST' }));
  const res = await request(app.listen())
    .get('/');
  t.deepEqual(JSON.stringify(res.body), JSON.stringify({}));
  t.is(res.headers['x-tmp'], 'TEST');
  t.is(res.status, 201);
});
test('provides a helper method (ctx.send) to send the response even if it was not found', async (t) => {
  const app = new Komapi({ loggers: [] });
  const reply = null;
  app.use(ctx => ctx.send(reply));
  const res = await request(app.listen())
    .get('/');
  t.deepEqual(JSON.stringify(res.body), JSON.stringify({}));
  t.is(res.status, 204);
});
test('is mountable with a route prefix', async (t) => {
  const app = new Komapi({ routePrefix: '/test' });
  app.use(ctx => ctx.send({ status: 'ok' }));
  const res = await request(app.listen());
  const res1 = await res.get('/');
  const res2 = await res.get('/test');
  t.is(res1.status, 404);
  t.is(res2.status, 200);
});
test('supports adding multiple middlewares at once', async (t) => {
  const app = new Komapi({ loggers: [] });
  t.plan(5);

  app.use(...[
    (ctx, next) => {
      t.pass();
      return next();
    },
    (ctx, next) => {
      t.pass();
      return next();
    },
    (ctx, next) => {
      t.pass();
      return next();
    },
    (ctx, next) => {
      t.pass();
      return next();
    },
    (ctx, next) => {
      t.pass();
      return next();
    },
  ]);
  await request(app.listen())
    .get('/');
});
test('supports mounting middleware at specific routes', async (t) => {
  const app = new Komapi({ loggers: [] });
  t.plan(3);
  app.use('/route1', ...[
    (ctx, next) => {
      t.pass();
      return next();
    },
    (ctx, next) => {
      t.pass();
      return next();
    },
  ]);
  app.use('/route2', ...[
    (ctx, next) => {
      t.pass();
      return next();
    },
    (ctx, next) => {
      t.pass();
      return next();
    },
    (ctx, next) => {
      t.pass();
      return next();
    },
  ]);
  await request(app.listen())
    .get('/route2');
});
test('orm query errors are logged exactly once by default', async (t) => {
  const app = new Komapi();
  t.plan(6);
  app.log.addStream({
    name: 'DummyLogger',
    level: 'info',
    type: 'raw',
    stream: new DummyLogger((obj) => {
      t.is(obj.context, 'orm');
      t.is(obj.level, 50);
      t.is(obj.msg, 'ORM Query Error');
    }),
  });
  app.models({ User: User.bindKnex(knex(connection)), Role: Role.bindKnex(knex(connection)) });
  t.is(app.orm.User.knex().listeners('query-error').length, 1);
  t.is(app.orm.Role.knex().listeners('query-error').length, 1);
  try {
    await app.orm.User.raw('select * from InvalidTable');
  } catch (err) {
    t.pass();
  }
});
test('orm query errors can be logged with custom logging function', async (t) => {
  const app = new Komapi();
  t.plan(5);
  app.models({
    User: User.bindKnex(knex(connection)),
    Role: Role.bindKnex(knex(connection)),
  }, {
    errorLogger: (err, obj) => {
      t.true(err instanceof Error);
      t.is(typeof obj, 'object');
    },
  });
  t.is(app.orm.User.knex().listeners('query-error').length, 1);
  t.is(app.orm.Role.knex().listeners('query-error').length, 1);
  try {
    await app.orm.User.raw('select * from InvalidTable');
  } catch (err) {
    t.pass();
  }
});
test('orm query error logging can be disabled', async (t) => {
  const app = new Komapi();
  app.models({ User: User.bindKnex(knex(connection)), Role: Role.bindKnex(knex(connection)) }, { errorLogger: null });
  t.is(app.orm.User.knex().listeners('query-error').length, 0);
  t.is(app.orm.Role.knex().listeners('query-error').length, 0);
});
test('models are loaded through app.models() and assigned to app.orm', async (t) => {
  const app = new Komapi();
  const models = {
    User: User.bindKnex(knex(connection)),
    Role: Role.bindKnex(knex(connection)),
    Permission: Permission.bindKnex(knex(connection)),
  };
  app.models(models);
  t.is(typeof app.orm, 'object');
  t.is(app.orm.User, models.User);
  t.is(app.orm.Role, models.Role);
  t.is(app.orm.Permission, models.Permission);
});
test('listen supports callbacks', async (t) => {
  const app = new Komapi({ loggers: [] });
  t.plan(2);
  app.use(ctx => ctx.send(null));
  const res = await request(await app.listen(() => t.pass()))
    .get('/');
  t.is(res.status, 204);
});
test('adding middlewares with missing dependency results in normal behaviour', async (t) => {
  const app = new Komapi({ loggers: [] });
  function dummyMiddleware() {}
  dummyMiddleware.registerBefore = 'non-existant-mw';
  app.use(dummyMiddleware);
  t.deepEqual(app.middleware[app.middleware.length - 1], dummyMiddleware);
});
test('ignores X-Request-ID from untrusted proxy', async (t) => {
  const app = new Komapi({ loggers: [] });
  const reqId = '1234';
  const res = await request(app.listen())
    .get('/')
    .set({ 'X-Request-ID': reqId });
  t.not(res.headers['x-request-id'], reqId);
});
test('respects X-Request-ID from trusted proxy', async (t) => {
  const app = new Komapi({ proxy: true });
  const reqId = '1234';
  const res = await request(app.listen())
    .get('/')
    .set({ 'X-Request-ID': reqId });
  t.is(res.headers['x-request-id'], reqId);
});
test('provides ctx.request.auth property that resolves to the passport property', async (t) => {
  t.plan(2);
  const app = new Komapi({ loggers: [] });
  app.use((ctx, next) => {
    t.is(ctx.request.auth, null);
    ctx.request.dummy = true; // eslint-disable-line no-param-reassign
    ctx.request._passport = { // eslint-disable-line no-param-reassign
      instance: {
        _userProperty: 'dummy',
      },
    };
    t.is(ctx.request.auth, true);
    return next();
  });
  await request(app.listen())
    .get('/');
});
test('supports managed routes', async (t) => {
  const app = new Komapi();
  app.route(router.routes());
  const req = request(app.listen());
  const res200 = await req.get('/');
  const res404 = await req.get('/not-found');
  t.is(res200.status, 200);
  t.deepEqual(res200.body, { status: 'ok' });
  t.is(res404.status, 404);
});
test('supports managed routes mounted at different path', async (t) => {
  const app = new Komapi();
  app.route('/test', router.routes());
  const req = request(app.listen());
  const res200 = await req.get('/test');
  const res404 = await req.get('/');
  t.is(res200.status, 200);
  t.deepEqual(res200.body, { status: 'ok' });
  t.is(res404.status, 404);
});
test('managed routes responds with 405 for unallowed methods', async (t) => {
  const app = new Komapi();
  app.route(router.routes());
  const res = await request(app.listen())
    .post('/');
  t.is(res.status, 405);
  t.deepEqual(res.body, {
    error: {
      code: '',
      status: 405,
      message: 'Method Not Allowed',
    },
  });
});
test('managed routes responds with 501 for SEARCH', async (t) => {
  const app = new Komapi();
  app.route(router.routes());
  const res = await request(app.listen())
    .search('/');
  t.is(res.status, 501);
  t.deepEqual(res.body, {
    error: {
      code: '',
      status: 501,
      message: 'Not Implemented',
    },
  });
});
