import type { en } from './messages/en';

/**
 * 键的联合类型直接从主词典推导。这里用 import type，
 * 编译后不留任何运行时代码，库层引用它不会把八套词典拖进 offscreen 分块。
 */
export type MessageKey = keyof typeof en;

export type MessageParams = Record<string, string | number>;
