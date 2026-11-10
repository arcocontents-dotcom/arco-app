// Testes das regras do dashboard (node --experimental-strip-types --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { production } from '../src/lib/domain.ts';

test('conta postados, atrasados e aprovações com/sem ajuste por formato', () => {
  const items = [
    { type: 'Reels', status: 'Postado', day: '2026-11-03', time: '18:00', answeredAt: 'x', hadAdjust: false },
    { type: 'Reels', status: 'Aprovado', day: '2026-11-05', time: '18:00', answeredAt: 'x', hadAdjust: true },
    { type: 'Carrossel', status: 'Aguardando', day: '2026-11-08', time: null, answeredAt: null, hadAdjust: false },
    { type: 'Post', status: 'Aguardando', day: '2026-11-20', time: null, answeredAt: null, hadAdjust: false },
    { type: 'Story', status: 'Ajustes', day: '2026-11-10', time: '09:00', answeredAt: 'x', hadAdjust: true },
    { type: 'Story', status: 'Rascunho', day: '2026-11-01', time: null, answeredAt: null, hadAdjust: false }
  ];
  const r = production(items, '2026-11-10', '12:00');
  assert.equal(r.Total.planned, 5);
  assert.equal(r.Reels.posted, 1);
  assert.equal(r.Reels.approvedClean, 1);
  assert.equal(r.Reels.approvedAdjusted, 1);
  assert.equal(r.Reels.late, 1); // aprovado em 05/11 e não postado
  assert.equal(r.Post.late, 1); // carrossel de 08/11 conta em Post
  assert.equal(r.Story.late, 1); // hoje às 09:00, agora 12:00
  assert.equal(r.Total.late, 3);
  assert.equal(r.Total.waiting, 2);
});
