import { uint32_t } from "./type-desc";
import type { TypeDesc } from "./type-desc";

export enum E {
  SUCCESS = 0,
  ACCES = 2,
  BADF = 8,
  CANCELED = 11,
  EXIST = 20,
  INVAL = 28,
  ISDIR = 31,
  NOENT = 44,
  NOSYS = 52,
  NOTDIR = 54,
  NOTEMPTY = 55,
  NOTCAPABLE = 76,
}

export const enum Whence {
  Current,
  End,
  Set,
}

export const enum OpenFlags {
  Create = 1 << 0,
  Directory = 1 << 1,
  Exclusive = 1 << 2,
  Truncate = 1 << 3,
}

export const enum FdFlags {
  Append = 1 << 0,
  DSync = 1 << 1,
  NonBlock = 1 << 2,
  RSync = 1 << 3,
  Sync = 1 << 4,
}

export type fd_t = number & { _name: "fd" };
export const fd_t = uint32_t as TypeDesc<fd_t>;
