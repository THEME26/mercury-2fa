import {
  errorReply,
  okReply,
  type VaultCommand,
  type VaultReply,
} from './protocol';
import type { VaultService } from './vault-service';

export type ClipboardClearer = () => Promise<boolean>;

/**
 * offscreen 文档的命令分发。抽出来是为了能脱离浏览器跑测试：
 * 每条命令都走一遍白名单解析与实际服务调用，测的正是线上跑的那段代码。
 */
export function createOffscreenHandler(service: VaultService, clearClipboard: ClipboardClearer) {
  return async function handle(command: VaultCommand): Promise<VaultReply> {
    try {
      switch (command.op) {
        case 'ping':
          return okReply({ ready: true });
        case 'status':
          return okReply(await service.status());
        case 'create':
          return okReply(await service.create(command.password, command.tier));
        case 'unlock':
          return okReply(await service.unlock(command.password));
        case 'lock':
          await service.lock();
          return okReply(null);
        case 'codes':
          return okReply(await service.listCodes());
        case 'add': {
          /** 条目记录带种子，只回 id */
          const entry = await service.add(command.input);
          return okReply({ id: entry.id });
        }
        case 'remove':
          await service.remove(command.id);
          return okReply(null);
        case 'pin':
          return okReply(await service.togglePin(command.id));
        case 'bump':
          return okReply(await service.bumpCounter(command.id));
        case 'export':
          return okReply(await service.exportBackup());
        case 'import':
          return okReply(await service.importBackup(command.text, command.password));
        case 'rewrap':
          await service.changePassword(command.oldPassword, command.newPassword, command.tier);
          return okReply(null);
        case 'setSettings':
          return okReply(await service.setSettings(command.patch));
        case 'selftest':
          return okReply(await service.selfTest());
        case 'clipboardClear':
          return okReply({ cleared: await clearClipboard() });
        default:
          return errorReply(new Error('未知命令'));
      }
    } catch (cause) {
      return errorReply(cause);
    }
  };
}

export type OffscreenHandler = ReturnType<typeof createOffscreenHandler>;
