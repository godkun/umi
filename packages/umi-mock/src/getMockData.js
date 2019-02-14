import { existsSync } from 'fs';
import bodyParser from 'body-parser';
import assert from 'assert';
import pathToRegexp from 'path-to-regexp';
import multer from 'multer';
import { join } from 'path';
import signale from 'signale';
import glob from 'glob';
import getPaths from './getPaths';

const debug = require('debug')('umi-mock:getMockData');
const VALID_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const BODY_PARSED_METHODS = ['post', 'put', 'patch', 'delete'];

function createHandler(method, path, handler) {
  return function(req, res, next) {
    if (BODY_PARSED_METHODS.includes(method)) {
      bodyParser.json({ limit: '5mb', strict: false })(req, res, () => {
        bodyParser.urlencoded({ limit: '5mb', extended: true })(
          req,
          res,
          () => {
            sendData();
          },
        );
      });
    } else {
      sendData();
    }

    function sendData() {
      if (typeof handler === 'function') {
        multer().any()(req, res, () => {
          handler(req, res, next);
        });
      } else {
        res.json(handler);
      }
    }
  };
}

export function normalizeConfig(config) {
  return Object.keys(config).reduce((memo, key) => {
    const handler = config[key];
    const type = typeof handler;
    assert(
      type === 'function' || type === 'object',
      `mock value of ${key} should be function or object, but got ${type}`,
    );
    const { method, path } = parseKey(key);
    const keys = [];
    const re = pathToRegexp(path, keys);
    memo.push({
      method,
      path,
      re,
      keys,
      handler: createHandler(method, path, handler),
    });
    return memo;
  }, []);
}

function parseKey(key) {
  let method = 'get';
  let path = key;
  if (key.indexOf(' ') > -1) {
    const splited = key.split(' ');
    method = splited[0].toLowerCase();
    path = splited[1]; // eslint-disable-line
  }
  assert(
    VALID_METHODS.includes(method),
    `Invalid method ${method} for path ${path}, please check your mock files.`,
  );
  return {
    method,
    path,
  };
}

function noop() {}

export function getMockFiles(opts) {
  const { cwd, absPagesPath, config = {} } = opts;
  const { absMockPath, absConfigPath } = getPaths(cwd);

  if (existsSync(absConfigPath)) {
    debug(`Load mock data from ${absConfigPath}`);
    return [absConfigPath];
  } else {
    let mockFiles = glob
      .sync('mock/**/*.js', {
        cwd,
        ignore: (config.mock || {}).exclude || [],
      })
      .map(p => join(cwd, p));

    if (absPagesPath) {
      mockFiles = mockFiles.concat(
        glob
          .sync('**/_mock.js', {
            cwd: absPagesPath,
          })
          .map(p => join(absPagesPath, p)),
      );
    }

    debug(
      `load mock data from ${absMockPath}, including files ${JSON.stringify(
        mockFiles,
      )}`,
    );
    return mockFiles;
  }
}

export function getMockConfigFromFiles(files) {
  return files.reduce((memo, mockFile) => {
    const m = require(mockFile); // eslint-disable-line
    memo = {
      ...memo,
      ...(m.default || m),
    };
    return memo;
  }, {});
}

function getMockConfig(opts) {
  return getMockConfigFromFiles(getMockFiles(opts));
}

export default function(opts) {
  const { onError = noop } = opts;

  try {
    return normalizeConfig(getMockConfig(opts));
  } catch (e) {
    onError(e);
    signale.error(`Mock files parse failed`);
    console.error(e.message);
  }
}
