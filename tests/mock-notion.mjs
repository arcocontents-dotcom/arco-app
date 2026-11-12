// Servidor falso da API do Notion (versão 2022-06-28), só para testes locais.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const schema = JSON.parse(readFileSync(new URL('../src/lib/schema.json', import.meta.url)));
const C = schema.clients;
const K = schema.contents;
const PL = schema.planning;

export const CLIENTS_DB = '11111111111111111111111111111111';
export const CONTENTS_DB = '22222222222222222222222222222222';
export const PLANNING_DB = '33333333333333333333333333333333';

const TYPES = {
  [CLIENTS_DB]: {
    [C.name]: 'title', [C.approvers]: 'rich_text', [C.viewers]: 'rich_text', [C.instagram]: 'rich_text',
    [C.igConnected]: 'checkbox', [C.igUserId]: 'rich_text', [C.igToken]: 'rich_text', [C.igTokenExpires]: 'date', [C.logo]: 'url', [C.cancelled]: 'checkbox', [C.calName]: 'rich_text', [C.push]: 'rich_text'
  },
  [CONTENTS_DB]: {
    [K.title]: 'title', [K.client]: 'relation', [K.date]: 'date', [K.type]: 'select', [K.status]: 'select',
    [K.video]: 'url', [K.cover]: 'url', [K.arts]: 'files', [K.storyImage]: 'url', [K.caption]: 'rich_text',
    [K.answeredBy]: 'email', [K.answeredAt]: 'date', [K.postedAt]: 'date', [K.hadAdjust]: 'checkbox', [K.adjustRounds]: 'number', [K.planning]: 'relation',
    ...Object.fromEntries(Object.values(K.itemStatus).map((n) => [n, 'select'])),
    ...Object.fromEntries(Object.values(K.itemNote).map((n) => [n, 'rich_text']))
  },
  [PLANNING_DB]: {
    [PL.title]: 'title', [PL.client]: 'select', [PL.date]: 'date', [PL.status]: 'status', [PL.kind]: 'select',
    [PL.note]: 'select', [PL.owner]: 'select', [PL.done]: 'checkbox', [PL.month]: 'select'
  }
};

// Opções existentes do Calendário mensal (o app só pode usar estas).
export const PLAN_OPTIONS = {
  [PL.client]: ['Studio Alfa', 'Beta Ltda', 'Outro Cliente'],
  [PL.kind]: ['Reels 1', 'Reels 2', 'Post 1', 'Storys 1', 'Fotos'],
  [PL.note]: ['Falta copy', 'Falta design', 'Falta edição', 'Aprovação post', 'Finalizado', 'Outros'],
  [PL.owner]: ['Yan', 'Marcos'],
  [PL.month]: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
  [PL.status]: ['Ideia', 'Realizando', 'Postado']
};

const norm = (id) => String(id).replace(/-/g, '').toLowerCase();
const fmtId = (h) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;

function toResponse(type, v) {
  switch (type) {
    case 'title':
    case 'rich_text': {
      const arr = (v?.[type] ?? []).map((t) => ({ type: 'text', plain_text: t.text.content, text: t.text }));
      return { type, [type]: arr };
    }
    case 'select': return { type, select: v.select ? { name: v.select.name } : null };
    case 'status': return { type, status: v.status ? { name: v.status.name } : null };
    case 'url': return { type, url: v.url ?? null };
    case 'email': return { type, email: v.email ?? null };
    case 'checkbox': return { type, checkbox: !!v.checkbox };
    case 'number': return { type, number: typeof v.number === 'number' ? v.number : null };
    case 'relation': return { type, relation: (v.relation ?? []).map((r) => ({ id: fmtId(norm(r.id)) })), has_more: false };
    case 'files': return { type, files: v.files ?? [] };
    case 'date': {
      if (!v.date) return { type, date: null };
      let start = v.date.start;
      if (v.date.time_zone && /T/.test(start) && !/[+-]\d\d:\d\d$|Z$/.test(start)) start = `${start}.000-04:00`;
      return { type, date: { start, end: null, time_zone: null } };
    }
  }
  throw new Error('tipo desconhecido ' + type);
}

function emptyProps(db) {
  const out = {};
  for (const [name, type] of Object.entries(TYPES[db])) {
    out[name] = toResponse(type, type === 'title' || type === 'rich_text' ? { [type]: [] } : type === 'relation' ? { relation: [] } : type === 'files' ? { files: [] } : type === 'checkbox' ? { checkbox: false } : type === 'number' ? { number: null } : type === 'date' ? { date: null } : {});
  }
  return out;
}

export const store = new Map();

export function seedPage(db, props, id = randomUUID().replace(/-/g, '')) {
  const page = { object: 'page', id: fmtId(norm(id)), url: `https://www.notion.so/${norm(id)}`, archived: false, parent: { type: 'database_id', database_id: fmtId(db) }, properties: emptyProps(db) };
  applyProps(page, db, props);
  store.set(norm(id), page);
  return page.id;
}

function applyProps(page, db, props) {
  for (const [name, v] of Object.entries(props ?? {})) {
    const type = TYPES[db][name];
    if (!type) throw Object.assign(new Error(`Propriedade inexistente: ${name}`), { status: 400 });
    if (db === PLANNING_DB && (type === 'select' || type === 'status')) {
      const val = v[type]?.name;
      if (val && !PLAN_OPTIONS[name].includes(val)) throw Object.assign(new Error(`Opção nova não permitida: ${name}=${val}`), { status: 400 });
    }
    page.properties[name] = toResponse(type, v);
  }
}

function plain(p) {
  if (!p) return '';
  if (p.type === 'title' || p.type === 'rich_text') return p[p.type].map((t) => t.plain_text).join('');
  return '';
}

function match(page, f) {
  if (!f) return true;
  if (f.and) return f.and.every((x) => match(page, x));
  if (f.or) return f.or.some((x) => match(page, x));
  const p = page.properties[f.property];
  if (!p) return false;
  if (f.relation) {
    if (f.relation.is_not_empty) return p.relation.length > 0;
    if (f.relation.is_empty) return p.relation.length === 0;
    return p.relation.some((r) => norm(r.id) === norm(f.relation.contains));
  }
  if (f.select) {
    const n = p.select?.name ?? null;
    if ('equals' in f.select) return n === f.select.equals;
    if ('does_not_equal' in f.select) return n !== f.select.does_not_equal;
    if (f.select.is_not_empty) return n !== null;
    if (f.select.is_empty) return n === null;
  }
  if (f.status) return (p.status?.name ?? null) === f.status.equals;
  if (f.checkbox) return p.checkbox === f.checkbox.equals;
  if (f.date) {
    if (f.date.is_empty) return !p.date?.start;
    if (f.date.is_not_empty) return !!p.date?.start;
    const s = p.date?.start?.slice(0, 10);
    if (!s) return false;
    if (f.date.on_or_after) return s >= f.date.on_or_after.slice(0, 10);
    if (f.date.on_or_before) return s <= f.date.on_or_before.slice(0, 10);
  }
  return true;
}

function sortPages(pages, sorts) {
  const s = sorts?.[0];
  if (!s) return pages;
  const key = (pg) => {
    const p = pg.properties[s.property];
    return p?.type === 'date' ? p.date?.start ?? '' : plain(p);
  };
  return pages.sort((a, b) => (s.direction === 'descending' ? -1 : 1) * key(a).localeCompare(key(b)));
}

export function startMock(port) {
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const json = body ? JSON.parse(body) : {};
    const send = (status, obj) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    try {
      const url = new URL(req.url, 'http://x');
      let m;
      if (req.method === 'POST' && (m = url.pathname.match(/^\/v1\/databases\/([^/]+)\/query$/))) {
        const db = norm(m[1]);
        const pages = [...store.values()].filter((p) => norm(p.parent.database_id) === db && !p.archived && match(p, json.filter));
        const sorted = sortPages(pages, json.sorts).slice(0, json.page_size ?? 100);
        return send(200, { object: 'list', results: sorted, has_more: false, next_cursor: null });
      }
      if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/databases\/([^/]+)$/))) {
        const db = norm(m[1]);
        if (!TYPES[db]) return send(404, { object: 'error', status: 404, code: 'object_not_found', message: 'not found' });
        const properties = Object.fromEntries(Object.entries(TYPES[db]).map(([n, t]) => [n, { type: t, ...(t === 'select' ? { select: { options: (PLAN_OPTIONS[n] ?? []).map((name) => ({ name })) } } : {}) }]));
        return send(200, { object: 'database', id: fmtId(db), properties });
      }
      if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/pages\/([^/]+)$/))) {
        const p = store.get(norm(m[1]));
        return p ? send(200, p) : send(404, { object: 'error', status: 404, code: 'object_not_found', message: 'not found' });
      }
      if (req.method === 'PATCH' && (m = url.pathname.match(/^\/v1\/pages\/([^/]+)$/))) {
        const p = store.get(norm(m[1]));
        if (!p) return send(404, { object: 'error', status: 404, code: 'object_not_found', message: 'not found' });
        if (json.properties) applyProps(p, norm(p.parent.database_id), json.properties);
        if (typeof json.archived === 'boolean') p.archived = json.archived;
        return send(200, p);
      }
      if (req.method === 'POST' && url.pathname === '/v1/pages') {
        const db = norm(json.parent.database_id);
        const id = seedPage(db, json.properties);
        return send(200, store.get(norm(id)));
      }
      send(404, { object: 'error', status: 404, code: 'invalid_request_url', message: req.url });
    } catch (e) {
      send(e.status ?? 500, { object: 'error', status: e.status ?? 500, code: 'validation_error', message: e.message });
    }
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}
