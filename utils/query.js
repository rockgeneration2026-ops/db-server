export const buildPagination = (query) => {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 12), 1), 50);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

export const normalizeSort = (query, allowed = ["created_at"]) => {
  const sortBy = allowed.includes(query.sortBy) ? query.sortBy : allowed[0];
  const order = query.order === "asc" ? "ASC" : "DESC";
  return { sortBy, order };
};

export const listResponse = (items, total, page, limit) => ({
  items,
  meta: {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  }
});

