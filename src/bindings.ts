// Copyright 2020 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { OpenFiles, FileOrDir, FIRST_PREOPEN_FD } from "./fileSystem";
import { instantiate } from "./asyncify";
import {
  enumer,
  ptr,
  string,
  struct,
  taggedUnion,
  TargetType,
  int8_t,
  uint8_t,
  uint16_t,
  uint32_t,
  uint64_t,
  size_t,
} from "./type-desc";
import { MyFile } from "@kobakazu0429/native-file-system-adapter-lite";
import { FdFlags, OpenFlags, Whence, E, fd_t } from "./constants";
import { SystemError } from "./errors";

export class ExitStatus {
  constructor(public statusCode: number) {}
}

const enum PreOpenType {
  Dir,
}
const preopentype_t = enumer<PreOpenType>(int8_t);

const prestat_t = struct({
  type: preopentype_t,
  nameLen: size_t,
});
type prestat_t = TargetType<typeof prestat_t>;

const iovec_t = struct({
  bufPtr: uint32_t,
  bufLen: size_t,
});
type iovec_t = TargetType<typeof iovec_t>;

const enum FileType {
  Unknown,
  BlockDevice,
  CharacterDevice,
  Directory,
  RegularFile,
  SocketDatagram,
  SocketStream,
  SymbolicLink,
}
const filetype_t = enumer<FileType>(uint8_t);

const fdflags_t = enumer<FdFlags>(uint16_t);

const rights_t = uint64_t;

const fdstat_t = struct({
  filetype: filetype_t,
  flags: fdflags_t,
  rightsBase: rights_t,
  rightsInheriting: rights_t,
});
type fdstat_t = TargetType<typeof fdstat_t>;

const dircookie_t = uint64_t;

const inode_t = uint64_t;

const dirent_t = struct({
  next: dircookie_t,
  ino: inode_t,
  nameLen: uint32_t,
  type: filetype_t,
});
type dirent_t = TargetType<typeof dirent_t>;

const device_t = uint64_t;

const linkcount_t = uint64_t;

const filesize_t = uint64_t;

const timestamp_t = uint64_t;

const filestat_t = struct({
  dev: device_t,
  ino: inode_t,
  filetype: filetype_t,
  nlink: linkcount_t,
  size: filesize_t,
  accessTime: timestamp_t,
  modTime: timestamp_t,
  changeTime: timestamp_t,
});
type filestat_t = TargetType<typeof filestat_t>;

const enum ClockId {
  Realtime,
  Monotonic,
  ProcessCPUTimeId,
  ThreadCPUTimeId,
}
const clockid_t = enumer<ClockId>(uint32_t);

const userdata_t = uint64_t;

const enum EventType {
  Clock,
  FdRead,
  FdWrite,
}
const eventtype_t = enumer<EventType>(uint8_t);

const enum SubclockFlags {
  Relative,
  Absolute,
}
const subclockflags_t = enumer<SubclockFlags>(uint16_t);

const subscription_clock_t = struct({
  id: clockid_t,
  timeout: timestamp_t,
  precision: timestamp_t,
  flags: subclockflags_t,
});

const subscription_fd_readwrite_t = struct({
  fd: fd_t,
});

const subscription_union_t = taggedUnion({
  tag: eventtype_t,
  data: {
    [EventType.Clock]: subscription_clock_t,
    [EventType.FdRead]: subscription_fd_readwrite_t,
    [EventType.FdWrite]: subscription_fd_readwrite_t,
  },
});

const subscription_t = struct({
  userdata: userdata_t,
  union: subscription_union_t,
});
type subscription_t = TargetType<typeof subscription_t>;

const enum EventRwFlags {
  None,
  FdReadWriteHangup,
}
const event_rw_flags_t = enumer<EventRwFlags>(uint16_t);

const event_fd_readwrite_t = struct({
  nbytes: filesize_t,
  flags: event_rw_flags_t,
});

const event_t = struct({
  userdata: userdata_t,
  error: enumer<E>(uint16_t),
  type: eventtype_t,
  fd_readwrite: event_fd_readwrite_t,
});
type event_t = TargetType<typeof event_t>;

export interface In {
  read(len: number): Uint8Array | Promise<Uint8Array>;
}

export interface Out {
  write(data: Uint8Array): void | Promise<void>;
}

export const bufferIn = (buffer: Uint8Array): In => {
  return {
    read: (len) => {
      const chunk = buffer.subarray(0, len);
      buffer = buffer.subarray(len);
      return chunk;
    },
  };
};

export const stringOut = (writeStr: (chunk: string) => void): Out => {
  const decoder = new TextDecoder();

  return {
    write: (data) => {
      writeStr(decoder.decode(data, { stream: true }));
    },
  };
};

export const lineOut = (writeLn: (chunk: string) => void): Out => {
  let lineBuf = "";

  return stringOut((chunk) => {
    lineBuf += chunk;
    const lines = lineBuf.split("\n");
    lineBuf = lines.pop()!;
    for (const line of lines) {
      writeLn(line);
    }
  });
};

function unimplemented(msg?: string) {
  console.error("[unimplemented] ", msg);
  throw new SystemError(E.NOSYS);
}

class StringCollection {
  constructor(strings: string[]) {
    this._offsets = new Uint32Array(strings.length);
    this._buffer = "";

    for (const [i, s] of strings.entries()) {
      this._offsets[i] = this._buffer.length;
      this._buffer += `${s}\0`;
    }
  }

  private readonly _offsets: Uint32Array;
  private readonly _buffer: string;

  sizes_get(buf: ArrayBuffer, countPtr: ptr<number>, sizePtr: ptr<number>) {
    size_t.set(buf, countPtr, this._offsets.length);
    size_t.set(buf, sizePtr, this._buffer.length);
  }

  get(buf: ArrayBuffer, offsetsPtr: ptr<Uint32Array>, ptr: ptr<string>) {
    new Uint32Array(buf, offsetsPtr, this._offsets.length).set(
      this._offsets.map((offset) => ptr + offset)
    );
    string.set(buf, ptr, this._buffer);
  }
}

export class Bindings {
  constructor({
    openFiles,
    stdin = { read: () => new Uint8Array() },
    stdout = lineOut(console.log),
    stderr = lineOut(console.error),
    args = [],
    env = {},
    abortSignal,
  }: {
    openFiles: OpenFiles;
    stdin?: In;
    stdout?: Out;
    stderr?: Out;
    args?: string[];
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }) {
    this._openFiles = openFiles;
    this._stdIn = stdin;
    this._stdOut = stdout;
    this._stdErr = stderr;
    this._args = new StringCollection(args);
    this._env = new StringCollection(
      Object.entries(env).map(([key, value]) => `${key}=${value}`)
    );
    this._abortSignal = abortSignal;
  }

  memory: WebAssembly.Memory | undefined;

  private _openFiles: OpenFiles;

  private _args: StringCollection;
  private _env: StringCollection;

  private _stdIn: In;
  private _stdOut: Out;
  private _stdErr: Out;

  private _abortSignal: AbortSignal | undefined;

  public async run(module: WebAssembly.Module): Promise<number> {
    const { exports } = await instantiate(module, {
      wasi_snapshot_preview1: this.getWasiImports(),
    });

    console.log(exports);

    const { _start, memory } = exports;
    this.memory = memory as WebAssembly.Memory;
    try {
      await (_start as any)();
      return 0;
    } catch (err: any) {
      console.error(err);
      if (err instanceof ExitStatus) {
        return err.statusCode;
      }
      throw err;
    }
  }

  public async exportFunction(
    module: WebAssembly.Module
  ): Promise<WebAssembly.Exports> {
    const { exports } = await instantiate(module, {
      wasi_snapshot_preview1: this.getWasiImports(),
    });

    return exports;
  }

  private _checkAbort() {
    if (this._abortSignal?.aborted) {
      throw new SystemError(E.CANCELED);
    }
  }

  private _wait(ms: number) {
    return new Promise((resolve, reject) => {
      const id = setTimeout(resolve, ms);
      this._abortSignal?.addEventListener("abort", () => {
        clearTimeout(id);
        reject(new SystemError(E.CANCELED));
      });
    });
  }

  private _getBuffer() {
    const { memory } = this;
    if (!memory) {
      throw new Error("Memory not yet initialised.");
    }
    return memory.buffer;
  }

  private _getFileStat(
    file: File | MyFile | undefined,
    filestatPtr: ptr<filestat_t>
  ) {
    let size = 0n;
    let time = 0n;
    if (file) {
      size = BigInt(file.size);
      time = BigInt(file.lastModified) * 1_000_000n;
    }
    filestat_t.set(this._getBuffer(), filestatPtr, {
      dev: 0n,
      ino: 0n, // TODO
      filetype: file ? FileType.RegularFile : FileType.Directory,
      nlink: 0n,
      size,
      accessTime: time,
      modTime: time,
      changeTime: time,
    });
  }

  private getWasiImports() {
    const bindings: Record<string, (...args: any[]) => void | Promise<void>> = {
      fd_prestat_get: (fd: fd_t, prestatPtr: ptr<prestat_t>) => {
        console.debug("[fd_prestat_get]");
        console.log(
          fd
          // this._openFiles.getPreOpen(fd),
          // this._openFiles.getPreOpen(fd).path,
          // this._openFiles.getPreOpen(fd).path.length
        );

        prestat_t.set(this._getBuffer(), prestatPtr, {
          type: PreOpenType.Dir,
          nameLen: this._openFiles.getPreOpen(fd).path.length,
        });
      },
      fd_prestat_dir_name: (
        fd: fd_t,
        pathPtr: ptr<string>,
        pathLen: number
      ) => {
        console.debug("[fd_prestat_dir_name]");
        string.set(
          this._getBuffer(),
          pathPtr,
          this._openFiles.getPreOpen(fd).path,
          pathLen
        );
      },
      environ_sizes_get: (countPtr: ptr<number>, sizePtr: ptr<number>) => {
        console.debug("[environ_sizes_get]");
        return this._env.sizes_get(this._getBuffer(), countPtr, sizePtr);
      },
      environ_get: (
        environPtr: ptr<Uint32Array>,
        environBufPtr: ptr<string>
      ) => {
        console.debug("[environ_get]");
        return this._env.get(this._getBuffer(), environPtr, environBufPtr);
      },
      args_sizes_get: (argcPtr: ptr<number>, argvBufSizePtr: ptr<number>) => {
        console.debug("[args_sizes_get]");
        return this._args.sizes_get(this._getBuffer(), argcPtr, argvBufSizePtr);
      },
      args_get: (argvPtr: ptr<Uint32Array>, argvBufPtr: ptr<string>) => {
        console.debug("[args_get]");
        return this._args.get(this._getBuffer(), argvPtr, argvBufPtr);
      },
      proc_exit: (code: number) => {
        console.debug("[proc_exit]");
        throw new ExitStatus(code);
      },
      random_get: (bufPtr: ptr<Uint8Array>, bufLen: number) => {
        console.debug("[random_get]");
        globalThis.crypto.getRandomValues(
          new Uint8Array(this._getBuffer(), bufPtr, bufLen)
        );
      },
      path_open: async (
        dirFd: fd_t,
        _dirFlags: number,
        pathPtr: ptr<string>,
        pathLen: number,
        oFlags: OpenFlags,
        _fsRightsBase: bigint,
        _fsRightsInheriting: bigint,
        fsFlags: FdFlags,
        fdPtr: ptr<fd_t>
      ) => {
        console.debug("[path_open]");
        if (fsFlags & FdFlags.NonBlock) {
          console.warn(
            "Asked for non-blocking mode while opening the file, falling back to blocking one."
          );
          fsFlags &= ~FdFlags.NonBlock;
        }
        if (fsFlags != 0) {
          unimplemented("path_open");
        }
        fd_t.set(
          this._getBuffer(),
          fdPtr,
          await this._openFiles.open(
            this._openFiles.getPreOpen(dirFd),
            string.get(this._getBuffer(), pathPtr, pathLen),
            oFlags
          )
        );
      },
      fd_fdstat_set_flags: (_fd: fd_t, _flags: FdFlags) => {
        return unimplemented("fd_fdstat_set_flags");
      },
      fd_close: (fd: fd_t) => {
        console.debug("[fd_close]", fd);
        return this._openFiles.close(fd);
      },
      fd_read: async (
        fd: fd_t,
        iovsPtr: ptr<iovec_t>,
        iovsLen: number,
        nreadPtr: ptr<number>
      ) => {
        console.debug("[fd_read]", fd);
        const input = fd === 0 ? this._stdIn : this._openFiles.get(fd).asFile();
        await this._forEachIoVec(iovsPtr, iovsLen, nreadPtr, async (buf) => {
          const chunk = await input.read(buf.length);
          buf.set(chunk);
          return chunk.length;
        });
      },
      fd_write: async (
        fd: fd_t,
        iovsPtr: ptr<iovec_t>,
        iovsLen: number,
        nwrittenPtr: ptr<number>
      ) => {
        console.debug("[fd_wrtie]", fd, iovsPtr, iovsLen, nwrittenPtr);
        let out: Out;
        switch (fd) {
          case 1: {
            out = this._stdOut;
            break;
          }
          case 2: {
            out = this._stdErr;
            break;
          }
          default: {
            out = this._openFiles.get(fd).asFile();
            break;
          }
        }
        await this._forEachIoVec(
          iovsPtr,
          iovsLen,
          nwrittenPtr,
          async (data) => {
            await out.write(data);
            return data.length;
          }
        );
      },
      fd_fdstat_get: async (fd: fd_t, fdstatPtr: ptr<fdstat_t>) => {
        console.debug("[fd_fdstat_get]", fd, fdstatPtr);
        let filetype;
        if (fd < FIRST_PREOPEN_FD) {
          filetype = FileType.CharacterDevice;
        } else if (this._openFiles.get(fd).isFile) {
          filetype = FileType.RegularFile;
        } else {
          filetype = FileType.Directory;
        }
        fdstat_t.set(this._getBuffer(), fdstatPtr, {
          filetype,
          flags: 0,
          rightsBase: /* anything */ -1n,
          rightsInheriting: /* anything but symlink */ ~(1n << 24n),
        });
      },
      path_create_directory: async (
        dirFd: fd_t,
        pathPtr: ptr<string>,
        pathLen: number
      ) => {
        console.debug("[path_create_directory]");
        return (
          this._openFiles
            .getPreOpen(dirFd)
            .getFileOrDir(
              string.get(this._getBuffer(), pathPtr, pathLen),
              FileOrDir.Dir,
              OpenFlags.Create | OpenFlags.Directory | OpenFlags.Exclusive
            )
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            .then(() => {})
        );
      },
      path_rename: async (
        _oldDirFd: fd_t,
        _oldPathPtr: ptr<string>,
        _oldPathLen: number,
        _newDirFd: fd_t,
        _newPathPtr: ptr<string>,
        _newPathLen: number
      ) => {
        console.debug("[path_rename]");
        return unimplemented("path_rename");
      },
      path_remove_directory: (
        dirFd: fd_t,
        pathPtr: ptr<string>,
        pathLen: number
      ) => {
        console.debug("[path_remove_directory]");
        this._openFiles
          .getPreOpen(dirFd)
          .delete(string.get(this._getBuffer(), pathPtr, pathLen));
      },
      fd_readdir: async (
        fd: fd_t,
        bufPtr: ptr<dirent_t>,
        bufLen: number,
        cookie: bigint,
        bufUsedPtr: ptr<number>
      ) => {
        console.debug("[fd_readdir]");
        const initialBufPtr = bufPtr;
        const openDir = this._openFiles.get(fd).asDir();
        const pos = Number(cookie);
        const entries = openDir.getEntries(pos);
        for await (const handle of entries) {
          this._checkAbort();
          const { name } = handle;
          const itemSize = dirent_t.size + name.length;
          if (bufLen < itemSize) {
            entries.revert(handle);
            break;
          }
          dirent_t.set(this._getBuffer(), bufPtr, {
            next: ++cookie,
            ino: 0n, // TODO
            nameLen: name.length,
            type:
              handle.kind === "file"
                ? FileType.RegularFile
                : FileType.Directory,
          });
          string.set(
            this._getBuffer(),
            (bufPtr + dirent_t.size) as ptr<string>,
            name
          );
          bufPtr = (bufPtr + itemSize) as ptr<dirent_t>;
          bufLen -= itemSize;
        }
        size_t.set(this._getBuffer(), bufUsedPtr, bufPtr - initialBufPtr);
      },
      path_readlink: (
        _dirFd: fd_t,
        _pathPtr: number,
        _pathLen: number,
        _bufPtr: number,
        _bufLen: number,
        _bufUsedPtr: number
      ) => unimplemented("path_readlink"),
      path_filestat_get: async (
        dirFd: fd_t,
        _flags: any,
        pathPtr: ptr<string>,
        pathLen: number,
        filestatPtr: ptr<filestat_t>
      ) => {
        console.debug("[path_filestat_get]");
        const handle = await this._openFiles
          .getPreOpen(dirFd)
          .getFileOrDir(
            string.get(this._getBuffer(), pathPtr, pathLen),
            FileOrDir.Any
          );
        return this._getFileStat(
          handle.kind === "file" ? await handle.getFile() : undefined,
          filestatPtr
        );
      },
      path_filestat_set_times: async () => {
        unimplemented();
      },
      fd_seek: async (
        fd: fd_t,
        offset: bigint,
        whence: Whence,
        filesizePtr: ptr<bigint>
      ) => {
        console.debug("[fd_seek]", fd);
        const openFile = this._openFiles.get(fd).asFile();
        let base: number;
        switch (whence) {
          case Whence.Current:
            base = openFile.position;
            break;
          case Whence.End:
            base = (await openFile.getFile()).size;
            break;
          case Whence.Set:
            base = 0;
            break;
        }
        openFile.position = base + Number(offset);
        uint64_t.set(this._getBuffer(), filesizePtr, BigInt(openFile.position));
      },
      fd_tell: (fd: fd_t, offsetPtr: ptr<bigint>) => {
        console.debug("[fd_tell]");

        uint64_t.set(
          this._getBuffer(),
          offsetPtr,
          BigInt(this._openFiles.get(fd).asFile().position)
        );
      },
      fd_filestat_get: async (fd: fd_t, filestatPtr: ptr<filestat_t>) => {
        console.debug("[fd_filestat_get]");
        const openFile = this._openFiles.get(fd);
        this._getFileStat(
          openFile.isFile ? await openFile.getFile() : undefined,
          filestatPtr
        );
      },
      path_unlink_file: (dirFd: fd_t, pathPtr: ptr<string>, pathLen: number) =>
        this._openFiles
          .getPreOpen(dirFd)
          .delete(string.get(this._getBuffer(), pathPtr, pathLen)),
      poll_oneoff: async (
        subscriptionPtr: ptr<subscription_t>,
        eventsPtr: ptr<event_t>,
        subscriptionsNum: number,
        eventsNumPtr: ptr<number>
      ) => {
        console.debug("[poll_oneoff]");
        if (subscriptionsNum === 0) {
          throw new RangeError("Polling requires at least one subscription");
        }
        let eventsNum = 0;
        const addEvent = (event: Partial<event_t>) => {
          Object.assign(event_t.get(this._getBuffer(), eventsPtr), event);
          eventsNum++;
          eventsPtr = (eventsPtr + event_t.size) as ptr<event_t>;
        };
        const clockEvents: {
          timeout: number;
          extra: number;
          userdata: bigint;
        }[] = [];
        for (let i = 0; i < subscriptionsNum; i++) {
          const { userdata, union } = subscription_t.get(
            this._getBuffer(),
            subscriptionPtr
          );
          subscriptionPtr = (subscriptionPtr +
            subscription_t.size) as ptr<subscription_t>;
          switch (union.tag) {
            case EventType.Clock: {
              let timeout = Number(union.data.timeout) / 1_000_000;
              if (union.data.flags === SubclockFlags.Absolute) {
                const origin =
                  union.data.id === ClockId.Realtime
                    ? Date
                    : globalThis.performance;
                timeout -= origin.now();
              }
              // This is not completely correct, since setTimeout doesn't give the required precision for monotonic clock.
              clockEvents.push({
                timeout,
                extra: Number(union.data.precision) / 1_000_000,
                userdata,
              });
              break;
            }
            default: {
              addEvent({
                userdata,
                error: E.NOSYS,
                type: union.tag,
                fd_readwrite: {
                  nbytes: 0n,
                  flags: EventRwFlags.None,
                },
              });
              break;
            }
          }
        }
        if (!eventsNum) {
          clockEvents.sort((a, b) => a.timeout - b.timeout);
          const wait = clockEvents[0].timeout + clockEvents[0].extra;
          let matchingCount = clockEvents.findIndex(
            (item) => item.timeout > wait
          );
          matchingCount =
            matchingCount === -1 ? clockEvents.length : matchingCount;
          await this._wait(clockEvents[matchingCount - 1].timeout);
          for (let i = 0; i < matchingCount; i++) {
            addEvent({
              userdata: clockEvents[i].userdata,
              error: E.SUCCESS,
              type: EventType.Clock,
            });
          }
        }
        size_t.set(this._getBuffer(), eventsNumPtr, eventsNum);
      },
      path_link: async (
        _oldDirFd: fd_t,
        _oldFlags: number,
        _oldPathPtr: ptr<string>,
        _oldPathLen: number,
        _newFd: fd_t,
        _newPathPtr: ptr<string>,
        _newPathLen: number
      ) => {
        console.debug("[path_link]");
        // console.debug(oldDirFd, oldFlags, oldPathPtr, oldPathLen);
        // const oldHandlePromise = this._openFiles
        //   .getPreOpen(oldDirFd)
        //   .getFileOrDir(
        //     string.get(this._getBuffer(), oldPathPtr, oldPathLen),
        //     FileOrDir.File,
        //     oldFlags
        //   );
        // console.log(this._openFiles.get(oldDirFd));

        // const newHandlePromise = this._openFiles
        //   .getPreOpen(newFd)
        //   .getFileOrDir(
        //     string.get(this._getBuffer(), newPathPtr, newPathLen),
        //     FileOrDir.File,
        //     OpenFlags.Create
        //   );

        // const [oldHandle, newHandle] = await Promise.all([
        //   oldHandlePromise,
        //   newHandlePromise
        // ]);

        // const oldFile =
        //   oldHandle.kind === 'file' ? await oldHandle.getFile() : undefined;
        // const newFile =
        //   newHandle.kind === 'file' ? await newHandle.getFile() : undefined;

        // console.log(oldFile, newFile);
        // console.log(this._openFiles);

        unimplemented("path_link");
      },
      fd_datasync: (fd: fd_t) => {
        console.debug("[fd_datasync]");
        return this._openFiles.get(fd).asFile().flush();
      },
      fd_sync: async (fd: fd_t) => {
        console.debug("[fd_sync]");
        const openFile = this._openFiles.get(fd);
        if (openFile.isFile) {
          await openFile.flush();
        }
      },
      fd_filestat_set_size: async (fd: fd_t, newSize: bigint) => {
        console.debug("[fd_filestat_set_size]");
        return this._openFiles.get(fd).asFile().setSize(Number(newSize));
      },
      fd_renumber: (from: fd_t, to: fd_t) => {
        console.debug("[fd_renumber]");

        return this._openFiles.renumber(from, to);
      },
      path_symlink: (
        _oldPath: ptr<string>,
        _fd: fd_t,
        _newPath: ptr<string>
      ) => {
        unimplemented("path_symlink");
      },
      clock_time_get: (
        id: ClockId,
        _precision: bigint,
        resultPtr: ptr<bigint>
      ) => {
        const origin = id === ClockId.Realtime ? Date : globalThis.performance;
        timestamp_t.set(
          this._getBuffer(),
          resultPtr,
          BigInt(Math.round(origin.now() * 1_000_000))
        );
      },
      clock_res_get: (_id: ClockId, resultPtr: ptr<bigint>) => {
        timestamp_t.set(this._getBuffer(), resultPtr, /* 1ms */ 1_000_000n);
      },
    };

    return new Proxy(bindings, {
      get: (target, name, receiver) => {
        // console.log(target, name);
        const value = Reflect.get(target, name, receiver);
        if (typeof name !== "string" || typeof value !== "function") {
          return value;
        }
        return async (...args: any[]) => {
          try {
            await value(...args);
            this._checkAbort();
            return E.SUCCESS;
          } catch (err: any) {
            return translateError(err);
          }
        };
      },
    });
  }

  private async _forEachIoVec(
    iovsPtr: ptr<iovec_t>,
    iovsLen: number,
    handledPtr: ptr<number>,
    cb: (buf: Uint8Array) => Promise<number>
  ) {
    let totalHandled = 0;
    for (let i = 0; i < iovsLen; i++) {
      const iovec = iovec_t.get(this._getBuffer(), iovsPtr);
      const buf = new Uint8Array(this._getBuffer(), iovec.bufPtr, iovec.bufLen);
      const handled = await cb(buf);
      this._checkAbort();
      totalHandled += handled;
      if (handled < iovec.bufLen) {
        break;
      }
      iovsPtr = (iovsPtr + iovec_t.size) as ptr<iovec_t>;
    }
    size_t.set(this._getBuffer(), handledPtr, totalHandled);
  }
}

function translateError(err: any): E {
  if (err instanceof SystemError) {
    // Warn about any error except the one we always expect.
    if (!err.ignore) {
      console.warn(err);
    }
    return err.code;
  }
  if (err instanceof Error) {
    let code;
    switch (err.name) {
      case "NotFoundError":
        code = E.NOENT;
        break;
      case "NotAllowedError":
      case "DataCloneError":
      case "SecurityError":
        code = E.ACCES;
        break;
      case "InvalidModificationError":
        code = E.NOTEMPTY;
        break;
      case "AbortError":
        code = E.CANCELED;
        break;
    }
    if (code) {
      console.warn(err);
      return code;
    }
  } else if (err instanceof TypeError || err instanceof RangeError) {
    console.warn(err);
    return E.INVAL;
  }
  throw err;
}
