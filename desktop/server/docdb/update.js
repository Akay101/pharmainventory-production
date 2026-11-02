// MongoDB update semantics for one in-memory document: operator updates,
// pipeline updates and upsert seeds. Only the application's own operators need
// to be exact; an unknown operator raises an error rather than doing nothing.
const { Query, Aggregator } = require("mingo");
const { encode, clone, compare } = require("./values");

const isPlain = (v) => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v);
const isOperatorUpdate = (u) => isPlain(u) && Object.keys(u).some((k) => k.startsWith("$"));
const isNumericKey = (p) => /^\d+$/.test(p);

// Resolve a dotted path, including $, $[] and $[name], to concrete containers.
// `visit(container, key)` runs for each match.
function walk(target, parts, i, ctx, create, visit) {
  const part = parts[i];
  const last = i === parts.length - 1;

  const descend = (container, key) => {
    if (last) return visit(container, key);
    let next = container[key];
    if (next === undefined || next === null) {
      if (!create) return undefined;
      next = isNumericKey(parts[i + 1]) ? [] : {};
      container[key] = next;
    }
    if (typeof next !== "object") {
      if (!create) return undefined;
      const err = new Error(`Cannot create field '${parts[i + 1]}' in element`);
      err.code = 28;
      throw err;
    }
    return walk(next, parts, i + 1, ctx, create, visit);
  };

  if (part === "$[]" || /^\$\[.+\]$/.test(part)) {
    if (!Array.isArray(target)) return undefined;
    const name = part === "$[]" ? null : part.slice(2, -1);
    target.forEach((el, idx) => {
      if (name === null || arrayFilterFor(ctx, name)(el)) descend(target, idx);
    });
    return undefined;
  }
  if (part === "$") {
    if (!Array.isArray(target)) return undefined;
    const idx = positionalIndex(target, parts.slice(0, i), ctx);
    if (idx < 0) {
      const err = new Error("The positional operator did not find the match needed from the query.");
      err.code = 2;
      throw err;
    }
    return descend(target, idx);
  }
  return descend(target, isNumericKey(part) && Array.isArray(target) ? Number(part) : part);
}

function arrayFilterFor(ctx, name) {
  ctx.compiled = ctx.compiled || {};
  if (ctx.compiled[name]) return ctx.compiled[name];
  const prefix = `${name}.`;
  const af = (ctx.arrayFilters || []).find((f) => Object.keys(f).some((k) => k === name || k.startsWith(prefix)));
  if (!af) {
    const err = new Error(`No array filter found for identifier '${name}'`);
    err.code = 2;
    throw err;
  }
  const condition = {};
  let whole = null;
  for (const [k, v] of Object.entries(af)) {
    if (k === name) whole = v;
    else condition[k.slice(prefix.length)] = v;
  }
  const q = whole !== null ? new Query({ value: whole }) : new Query(condition);
  ctx.compiled[name] = whole !== null ? (el) => q.test({ value: el }) : (el) => q.test(el);
  return ctx.compiled[name];
}

// `$` means the first array element that the query matched
function positionalIndex(arr, prefixParts, ctx) {
  const prefix = prefixParts.join(".");
  const cond = {};
  let elemMatch = null;
  const scan = (filter) => {
    for (const [k, v] of Object.entries(filter || {})) {
      if (k === "$and" && Array.isArray(v)) v.forEach(scan);
      else if (k === prefix && isPlain(v) && v.$elemMatch) elemMatch = v.$elemMatch;
      else if (k === prefix) cond.__value = v;
      else if (k.startsWith(`${prefix}.`)) cond[k.slice(prefix.length + 1)] = v;
    }
  };
  scan(ctx.filter);
  if (elemMatch) {
    const q = new Query(elemMatch);
    return arr.findIndex((el) => q.test(el));
  }
  if ("__value" in cond) {
    const q = new Query({ value: cond.__value });
    return arr.findIndex((el) => q.test({ value: el }));
  }
  const q = new Query(cond);
  return arr.findIndex((el) => q.test(el));
}

const set = (doc, path, value, ctx) =>
  walk(doc, path.split("."), 0, ctx, true, (c, k) => {
    c[k] = value;
  });

const unset = (doc, path, ctx) =>
  walk(doc, path.split("."), 0, ctx, false, (c, k) => {
    if (Array.isArray(c)) c[k] = null;
    else delete c[k];
  });

const toNumberError = (op, path) => {
  const err = new Error(`Cannot apply ${op} to a value of non-numeric type at '${path}'`);
  err.code = 14;
  return err;
};

const OPERATORS = {
  $set(doc, field, value, ctx) {
    set(doc, field, clone({ v: value }).v, ctx);
  },
  $unset(doc, field, value, ctx) {
    unset(doc, field, ctx);
  },
  $inc(doc, field, value, ctx) {
    walk(doc, field.split("."), 0, ctx, true, (c, k) => {
      const cur = c[k];
      if (cur === undefined) c[k] = value;
      else if (typeof cur !== "number") throw toNumberError("$inc", field);
      else c[k] = cur + value;
    });
  },
  $mul(doc, field, value, ctx) {
    walk(doc, field.split("."), 0, ctx, true, (c, k) => {
      const cur = c[k];
      if (cur === undefined) c[k] = 0;
      else if (typeof cur !== "number") throw toNumberError("$mul", field);
      else c[k] = cur * value;
    });
  },
  $min(doc, field, value, ctx) {
    walk(doc, field.split("."), 0, ctx, true, (c, k) => {
      if (c[k] === undefined || compare(value, c[k]) < 0) c[k] = value;
    });
  },
  $max(doc, field, value, ctx) {
    walk(doc, field.split("."), 0, ctx, true, (c, k) => {
      if (c[k] === undefined || compare(value, c[k]) > 0) c[k] = value;
    });
  },
  $currentDate(doc, field, value, ctx) {
    set(doc, field, new Date(), ctx);
  },
  $rename(doc, field, value, ctx) {
    let moved;
    let found = false;
    walk(doc, field.split("."), 0, ctx, false, (c, k) => {
      if (k in c) {
        moved = c[k];
        found = true;
        delete c[k];
      }
    });
    if (found) set(doc, value, moved, ctx);
  },
  $push(doc, field, value, ctx) {
    walk(doc, field.split("."), 0, ctx, true, (c, k) => {
      if (c[k] === undefined) c[k] = [];
      if (!Array.isArray(c[k])) throw toNumberError("$push", field);
      const modified = isPlain(value) && "$each" in value;
      const items = clone({ v: modified ? value.$each : [value] }).v;
      if (modified && value.$position !== undefined) c[k].splice(value.$position, 0, ...items);
      else c[k].push(...items);
      if (modified && value.$sort !== undefined) {
        const spec = value.$sort;
        c[k].sort((a, b) => {
          if (!isPlain(spec)) return compare(a, b) * spec;
          for (const [f, dir] of Object.entries(spec)) {
            const d = compare(a?.[f], b?.[f]) * dir;
            if (d) return d;
          }
          return 0;
        });
      }
      if (modified && value.$slice !== undefined) {
        c[k] = value.$slice < 0 ? c[k].slice(value.$slice) : c[k].slice(0, value.$slice);
      }
    });
  },
  $addToSet(doc, field, value, ctx) {
    walk(doc, field.split("."), 0, ctx, true, (c, k) => {
      if (c[k] === undefined) c[k] = [];
      if (!Array.isArray(c[k])) throw toNumberError("$addToSet", field);
      const items = isPlain(value) && "$each" in value ? value.$each : [value];
      const seen = new Set(c[k].map((x) => encode({ v: x })));
      for (const item of items) {
        const key = encode({ v: item });
        if (!seen.has(key)) {
          seen.add(key);
          c[k].push(clone({ v: item }).v);
        }
      }
    });
  },
  $pull(doc, field, value, ctx) {
    walk(doc, field.split("."), 0, ctx, false, (c, k) => {
      if (!Array.isArray(c[k])) return;
      const objectCondition = isPlain(value) && !Object.keys(value).every((x) => x.startsWith("$"));
      const q = new Query(objectCondition ? value : { value });
      c[k] = c[k].filter((el) => !(objectCondition ? isPlain(el) && q.test(el) : q.test({ value: el })));
    });
  },
  $pullAll(doc, field, value, ctx) {
    walk(doc, field.split("."), 0, ctx, false, (c, k) => {
      if (!Array.isArray(c[k])) return;
      const drop = new Set(value.map((x) => encode({ v: x })));
      c[k] = c[k].filter((el) => !drop.has(encode({ v: el })));
    });
  },
  $pop(doc, field, value, ctx) {
    walk(doc, field.split("."), 0, ctx, false, (c, k) => {
      if (!Array.isArray(c[k])) return;
      if (value < 0) c[k].shift();
      else c[k].pop();
    });
  },
};

function applyUpdate(doc, update, { filter, arrayFilters, isInsert = false } = {}) {
  if (Array.isArray(update)) {
    const out = new Aggregator(update).run([doc]);
    return out[0];
  }
  const ctx = { filter, arrayFilters };
  for (const [op, fields] of Object.entries(update)) {
    if (op === "$setOnInsert") {
      if (isInsert) for (const [f, v] of Object.entries(fields)) OPERATORS.$set(doc, f, v, ctx);
      continue;
    }
    const fn = OPERATORS[op];
    if (!fn) {
      const err = new Error(`Unsupported update operator ${op}`);
      err.code = 9;
      throw err;
    }
    for (const [f, v] of Object.entries(fields)) fn(doc, f, v, ctx);
  }
  return doc;
}

// Fields an upsert takes from its filter: plain equalities only
function seedFromFilter(filter, doc = {}) {
  for (const [k, v] of Object.entries(filter || {})) {
    if (k === "$and" && Array.isArray(v)) {
      v.forEach((f) => seedFromFilter(f, doc));
    } else if (k === "$or" && Array.isArray(v) && v.length === 1) {
      seedFromFilter(v[0], doc);
    } else if (!k.startsWith("$")) {
      if (isPlain(v)) {
        if ("$eq" in v) set(doc, k, clone({ v: v.$eq }).v, {});
        else if (!Object.keys(v).some((x) => x.startsWith("$"))) set(doc, k, clone({ v }).v, {});
      } else if (!(v instanceof RegExp)) {
        set(doc, k, clone({ v }).v, {});
      }
    }
  }
  return doc;
}

module.exports = { applyUpdate, seedFromFilter, isOperatorUpdate };
