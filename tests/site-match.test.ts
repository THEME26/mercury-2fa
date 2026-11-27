import { describe, expect, it } from 'vitest';
import { bestMatch, domainLabel, normalizeIssuer, registrableDomain, scoreEntry } from '../lib/fill/site-match';

describe('域名归一化', () => {
  it('常见后缀取到注册域', () => {
    expect(registrableDomain('github.com')).toBe('github.com');
    expect(registrableDomain('accounts.google.com')).toBe('google.com');
    expect(registrableDomain('login.acme.co.uk')).toBe('acme.co.uk');
    expect(registrableDomain('a.b.example.com.cn')).toBe('example.com.cn');
  });

  it('主标签只取一级', () => {
    expect(domainLabel('accounts.google.com')).toBe('google');
    expect(domainLabel('www.amazon.co.jp')).toBe('amazon');
  });

  it('发行方去掉标点与公司后缀', () => {
    expect(normalizeIssuer('GitHub')).toBe('github');
    expect(normalizeIssuer('Acme, Inc.')).toBe('acme');
    expect(normalizeIssuer('Cloudflare, Ltd')).toBe('cloudflare');
    expect(normalizeIssuer('银行 U 盾')).toBe('银行u盾');
  });
});

describe('站点与发行方打分', () => {
  it('同名域名满分', () => {
    expect(scoreEntry('github.com', 'GitHub')).toBe(100);
    expect(scoreEntry('accounts.google.com', 'Google')).toBe(100);
  });

  it('发行方的词出现在子域名里', () => {
    expect(scoreEntry('aws.amazon.com', 'AWS Root')).toBe(80);
    expect(scoreEntry('signin.aws.amazon.com', 'AWS')).toBe(80);
  });

  it('互相包含给中等分', () => {
    expect(scoreEntry('cloudflare.com', 'Cloudflare Dashboard')).toBe(80);
    expect(scoreEntry('gitlab.example.com', 'GitLab')).toBeGreaterThanOrEqual(70);
  });

  it('拼写差一个字母仍能匹配', () => {
    expect(scoreEntry('githuh.com', 'Github')).toBe(50);
    expect(scoreEntry('gitlab.com', 'Gitlabb')).toBe(70);
    expect(scoreEntry('guthub.com', 'Github')).toBe(50);
  });

  it('无关站点不给分', () => {
    expect(scoreEntry('example.com', 'GitHub')).toBe(0);
    expect(scoreEntry('bankofchina.com', 'Steam')).toBe(0);
  });
});

describe('选取最佳条目', () => {
  const entries = [
    { id: '1', issuer: 'GitHub' },
    { id: '2', issuer: 'Google' },
    { id: '3', issuer: 'AWS Root' },
  ];

  it('命中当前站点', () => {
    expect(bestMatch('github.com', entries)?.id).toBe('1');
    expect(bestMatch('console.aws.amazon.com', entries)?.id).toBe('3');
  });

  it('低于 70 分不当默认项', () => {
    expect(bestMatch('random-blog.example', entries)).toBeNull();
  });
});
