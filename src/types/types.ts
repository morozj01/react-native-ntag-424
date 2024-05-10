type CommandOptions = {
  adpuHeader: number[];
  commandHeader: number[];
  commandData: number[];
  commandMode: 'plain' | 'mac' | 'full';
  includeLe: boolean;
};

type ReadWriteFileOption = 'cc' | 'ndef' | 'proprietary';

type SelectFileOption = 'master' | 'application' | ReadWriteFileOption;

export type { CommandOptions, SelectFileOption, ReadWriteFileOption };
