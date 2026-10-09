'use strict';

const AppError = require('../utils/AppError');

/**
 * Validates req.body / req.params / req.query against zod schemas.
 * On success the parsed (and coerced/sanitised) values replace the originals.
 * Unknown fields on write bodies are rejected because the schemas are .strict().
 */
function validate(schemas) {
  return function validateMiddleware(req, res, next) {
    try {
      for (const source of ['params', 'query', 'body']) {
        const schema = schemas[source];
        if (!schema) continue;

        const result = schema.safeParse(req[source]);
        if (!result.success) {
          const errors = result.error.issues.map((issue) => ({
            field: issue.path.join('.') || '(root)',
            message: issue.message,
          }));
          throw new AppError('Validation failed', 400, errors);
        }

        if (source === 'query') {
          // Express 5 exposes req.query as a getter; redefine it to store parsed data.
          Object.defineProperty(req, 'query', {
            value: result.data,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        } else {
          req[source] = result.data;
        }
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = validate;
