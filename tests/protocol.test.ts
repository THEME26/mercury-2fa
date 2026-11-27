import { describe, expect, it } from 'vitest';
import {
  assertNoSecretPayload,
  errorReply,
  findSecretKey,
  normalizeCommand,
  okReply,
  ProtocolViolation,
} from '../lib/protocol';

describe('命令白名单', () => {
  it('只放行已知命令', () => {
    expect(normalizeCommand({ target: 'vault', op: 'codes' }, 'vault')).toEqual({ op: 'codes' });
    expect(normalizeCommand({ target: 'vault', op: 'dropTable' }, 'vault')).toBeNull();
    expect(normalizeCommand({ target: 'vault', op: 'toString' }, 'vault')).toBeNull();
  });

  it('target 不匹配就不处理', () => {
    expect(normalizeCommand({ target: 'offscreen', op: 'codes' }, 'vault')).toBeNull();
    expect(normalizeCommand({ op: 'codes' }, 'vault')).toBeNull();
    expect(normalizeCommand(null, 'vault')).toBeNull();
    expect(normalizeCommand('codes', 'vault')).toBeNull();
  });

  it('重建对象，多余字段不会进下游', () => {
    const command = normalizeCommand(
      { target: 'vault', op: 'unlock', password: 'p@ss1234', extra: 'injected', __proto__: { evil: true } },
      'vault',
    );
    expect(command).toEqual({ op: 'unlock', password: 'p@ss1234' });
    expect(Object.keys(command ?? {})).toEqual(['op', 'password']);
  });

  it('缺字段或类型不对一律拒绝', () => {
    expect(normalizeCommand({ target: 'vault', op: 'unlock' }, 'vault')).toBeNull();
    expect(normalizeCommand({ target: 'vault', op: 'unlock', password: '' }, 'vault')).toBeNull();
    expect(normalizeCommand({ target: 'vault', op: 'unlock', password: 42 }, 'vault')).toBeNull();
    expect(normalizeCommand({ target: 'vault', op: 'remove', id: '' }, 'vault')).toBeNull();
    expect(normalizeCommand({ target: 'vault', op: 'remove', id: 'x'.repeat(200) }, 'vault')).toBeNull();
  });

  it('导入文本超长直接拒绝', () => {
    const huge = 'a'.repeat(2_000_001);
    expect(normalizeCommand({ target: 'vault', op: 'import', text: huge, password: 'p@ss1234' }, 'vault')).toBeNull();
    const fine = 'a'.repeat(1024);
    expect(normalizeCommand({ target: 'vault', op: 'import', text: fine, password: 'p@ss1234' }, 'vault')).toEqual({
      op: 'import',
      text: fine,
      password: 'p@ss1234',
    });
  });

  it('设置补丁只保留认识的键', () => {
    const command = normalizeCommand(
      { target: 'vault', op: 'setSettings', patch: { lockAfterMs: 5000, evil: 1, kdfTier: 'high' } },
      'vault',
    );
    expect(command).toEqual({ op: 'setSettings', patch: { lockAfterMs: 5000, kdfTier: 'high' } });
  });

  it('新增条目必须带类型与种子', () => {
    expect(normalizeCommand({ target: 'vault', op: 'add', input: {} }, 'vault')).toBeNull();
    const command = normalizeCommand(
      {
        target: 'vault',
        op: 'add',
        input: { manual: { type: 'totp', issuer: 'GitHub', account: 'a', secret: 'JBSWY3DP' } },
      },
      'vault',
    );
    expect(command).toMatchObject({ op: 'add', input: { manual: { issuer: 'GitHub', secret: 'JBSWY3DP' } } });
  });
});

describe('出站闸门', () => {
  it('picks 出返回值里的 secret 字段', () => {
    expect(findSecretKey({ id: '1', issuer: 'GitHub' })).toBeNull();
    expect(findSecretKey({ entries: [{ id: '1', secret: 'JBSWY3DP' }] })).toBe('entries[0].secret');
    expect(findSecretKey({ a: { b: { secrets: [] } } })).toBe('a.b.secrets');
  });

  it('带种子的返回值发不出去', () => {
    expect(() => okReply({ id: '1', secret: 'JBSWY3DP' })).toThrow(ProtocolViolation);
    expect(() => assertNoSecretPayload({ nested: [{ secret: 'x' }] })).toThrow(/种子字段/);
  });

  it('正常的条目视图可以通过', () => {
    const view = {
      id: 'a1',
      type: 'totp',
      issuer: 'GitHub',
      account: 'alice',
      digits: 6,
      period: 30,
      pinned: false,
      code: '123456',
      expiresAt: 1,
      step: 2,
    };
    expect(okReply([view])).toEqual({ ok: true, data: [view] });
  });

  it('导出文本是字符串，不受字段检查影响', () => {
    const text = JSON.stringify({ format: 'mercury-2fa-backup', vault: { payload: { data: 'AAAA' } } });
    expect(okReply(text).ok).toBe(true);
  });

  it('错误对象只透出 message 与 code', () => {
    const error = Object.assign(new Error('主密码不正确'), { code: 'wrong-password' });
    expect(errorReply(error)).toEqual({ ok: false, error: { message: '主密码不正确', code: 'wrong-password' } });
    expect(errorReply('boom')).toEqual({ ok: false, error: { message: '未知错误', code: undefined } });
  });
});
