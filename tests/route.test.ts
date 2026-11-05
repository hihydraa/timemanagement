import { describe, expect, it } from 'vitest';
import { resolveRoute, routeToHash } from '../apps/web/src/lib/route';

const r = (hash = '', pathname = '/', search = '') => resolveRoute({ pathname, hash, search });

describe('เส้นทางมาตรฐาน (3 แท็บ)', () => {
  it('หน้าแรก = วันนี้ (ไม่ redirect), แผน, ฉัน, โฟกัส', () => {
    expect(r()).toEqual({ route: { view: 'today' }, hash: '', redirected: false });
    expect(r('#/today').route).toEqual({ view: 'today' });
    expect(r('#/plan')).toEqual({ route: { view: 'plan' }, hash: '#/plan', redirected: false });
    expect(r('#/me')).toEqual({
      route: { view: 'me', me: 'overview' },
      hash: '#/me',
      redirected: false,
    });
    expect(r('#/me/review').route).toEqual({ view: 'me', me: 'review' });
    expect(r('#/me/stats').route).toEqual({ view: 'me', me: 'stats' });
    expect(r('#/focus')).toEqual({ route: { view: 'focus' }, hash: '#/focus', redirected: false });
    expect(r('#/plan/matrix').route).toEqual({ view: 'plan', plan: 'matrix' });
    expect(r('#/today/unscheduled').route).toEqual({ view: 'today', anchor: 'unscheduled' });
  });
});

describe('redirect เส้นทางเก่า (hash)', () => {
  it.each([
    ['#/inbox', { view: 'today', anchor: 'unscheduled' }, '#/today/unscheduled'],
    ['#/calendar', { view: 'plan' }, '#/plan'],
    ['#/matrix', { view: 'plan', plan: 'matrix' }, '#/plan/matrix'],
    ['#/review', { view: 'me', me: 'review' }, '#/me/review'],
    ['#/stats', { view: 'me', me: 'stats' }, '#/me/stats'],
  ])('%s → %s', (hash, route, canonical) => {
    const x = r(hash);
    expect(x.route).toEqual(route);
    expect(x.hash).toBe(canonical);
    expect(x.redirected).toBe(true);
  });
});

describe('redirect เส้นทางเก่า (path แบบ /inbox ฯลฯ ตามสเปค)', () => {
  it.each([
    ['/inbox', '#/today/unscheduled'],
    ['/calendar', '#/plan'],
    ['/matrix', '#/plan/matrix'],
    ['/review', '#/me/review'],
    ['/stats', '#/me/stats'],
    ['/focus', '#/focus'],
    ['/me', '#/me'],
    ['/plan', '#/plan'],
  ])('%s → %s', (path, hash) => {
    const x = r('', path);
    expect(x.hash).toBe(hash);
    expect(x.redirected).toBe(true);
  });
  it('path/hash ที่ไม่รู้จักกลับหน้าวันนี้; ตัวพิมพ์ใหญ่/เครื่องหมาย / ท้ายไม่กระทบ', () => {
    expect(r('#/nonsense').route).toEqual({ view: 'today' });
    expect(r('#/nonsense').redirected).toBe(true);
    expect(r('', '/whatever').route).toEqual({ view: 'today' });
    expect(r('#/Review/').route).toEqual({ view: 'me', me: 'review' });
    expect(r('', '/inbox/').route).toEqual({ view: 'today', anchor: 'unscheduled' });
  });
  it('hash ชนะ path เมื่อมีทั้งคู่', () => {
    expect(r('#/plan', '/inbox').route).toEqual({ view: 'plan' });
  });
});

describe('ลิงก์แก้ไขจาก LINE (?task=)', () => {
  it('/?task=<id> ไปหน้าแผน (ที่เปิดฟอร์มงาน) และคง query', () => {
    expect(r('', '/', '?task=abc').route).toEqual({ view: 'plan' });
    expect(r('#/today', '/', '?task=abc').route).toEqual({ view: 'today' }); // ผู้ใช้เลือกแท็บเองแล้ว
  });
});

describe('routeToHash', () => {
  it('ย้อนกลับได้ (round trip)', () => {
    for (const h of [
      '',
      '#/plan',
      '#/plan/matrix',
      '#/me',
      '#/me/review',
      '#/me/stats',
      '#/focus',
      '#/today/unscheduled',
    ]) {
      expect(routeToHash(r(h).route)).toBe(h);
    }
  });
});
