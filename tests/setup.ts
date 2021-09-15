import { randomBytes } from "crypto";
import { performance } from "perf_hooks";
import { File, Blob } from "web-file-polyfill";
import { WritableStream, ReadableStream } from "web-streams-polyfill";

import {
  showDirectoryPicker,
  showOpenFilePicker,
  showSaveFilePicker,
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  FileSystemWritableFileStream,
  FileSystemHandle,
  getOriginPrivateDirectory,
} from "../../native-file-system-adapter-lite/src/index";

(() => {
  globalThis.File = File;
  globalThis.Blob = Blob;

  globalThis.WritableStream = WritableStream;
  // @ts-ignore
  globalThis.ReadableStream = ReadableStream;
  // @ts-ignore
  globalThis.TransformStream = TransformStream;

  // @ts-ignore
  globalThis.showDirectoryPicker = showDirectoryPicker;
  // @ts-ignore
  globalThis.showOpenFilePicker = showOpenFilePicker;
  // @ts-ignore
  globalThis.showSaveFilePicker = showSaveFilePicker;
  // @ts-ignore
  globalThis.FileSystemDirectoryHandle = FileSystemDirectoryHandle;
  // @ts-ignore
  globalThis.FileSystemFileHandle = FileSystemFileHandle;
  // @ts-ignore
  globalThis.FileSystemHandle = FileSystemHandle;
  // @ts-ignore
  globalThis.FileSystemWritableFileStream = FileSystemWritableFileStream;
  // @ts-ignore
  globalThis.getOriginPrivateDirectory = getOriginPrivateDirectory;

  // @ts-ignore
  globalThis.performance = performance;

  // @ts-ignore
  globalThis.crypto = {};
  globalThis.crypto.getRandomValues = randomBytes;
})();
