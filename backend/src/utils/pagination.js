'use strict';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function getPagination(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
}

function buildPaginated(items, count, { page, limit }) {
  return {
    items,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit) || 0,
    },
  };
}

module.exports = { getPagination, buildPaginated, DEFAULT_LIMIT, MAX_LIMIT };
