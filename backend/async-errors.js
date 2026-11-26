'use strict';
// Express 4 only catches errors that a handler throws synchronously. If an
// async handler's promise rejects (e.g. a bad input or a lost DB connection),
// Node treats it as an unhandled rejection and the whole server exits.
// This patch forwards those rejections to next(err), so the global error
// handler in server.js shows the error page and the server keeps running.
// Require it once, before any routes are registered.

const Layer = require('express/lib/router/layer');

const original = Layer.prototype.handle_request;

Layer.prototype.handle_request = function handle(req, res, next) {
  const fn = this.handle;
  if (fn.length > 3) return original.call(this, req, res, next); // error handlers etc.

  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') {
      result.catch(err => next(err || new Error('Rejected with no error')));
    }
  } catch (err) {
    next(err);
  }
};
