import "jest-extended";

import path from "path";
import { readFile } from "fs/promises";
import { Bindings, stringOut, OpenFiles } from "../src";

import {
  getOriginPrivateDirectory,
  node,
} from "@kobakazu0429/native-file-system-adapter-lite";

describe("export", () => {
  test("main", async () => {
    const wasmName = "async-export.wasm";
    const module = readFile(
      path.resolve(
        path.join(
          __dirname,
          "..",
          "demo",
          "public",
          "tests",
          "async-wasm",
          wasmName
        )
      )
    ).then((buf) => WebAssembly.compile(buf));

    const rootHandle = await getOriginPrivateDirectory(
      node,
      path.resolve(
        path.join(__dirname, "..", "demo", "public", "tests", "fixtures")
      )
    );
    const [sandbox, tmp] = await Promise.all([
      rootHandle.getDirectoryHandle("sandbox"),
      rootHandle.getDirectoryHandle("tmp"),
    ]);

    let stdout = "";
    const exitCode = await new Bindings({
      openFiles: new OpenFiles({
        // @ts-ignore
        "/sandbox": sandbox,
        // @ts-ignore
        "/tmp": tmp,
      }),
      stdout: stringOut((s) => (stdout += s)),
    }).run(await module);

    expect(stdout).toBe("10 + 3 = 13\n10 / 3 = 3.33\n");
    expect(exitCode).toBe(0);
  });

  test("export function", async () => {
    const wasmName = "async-export.wasm";
    const module = readFile(
      path.resolve(
        path.join(
          __dirname,
          "..",
          "demo",
          "public",
          "tests",
          "async-wasm",
          wasmName
        )
      )
    ).then((buf) => WebAssembly.compile(buf));

    let stdout = "";
    const { sum, div } = (await new Bindings({
      openFiles: new OpenFiles({}),
      stdout: stringOut((s) => (stdout += s)),
    }).exportFunction(await module)) as {
      [k in "sum" | "div"]: (a: number, b: number) => Promise<number>;
    };

    expect(await sum(1, 1)).toBe(2);
    expect(await sum(1, -1)).toBe(0);
    expect(await sum(-1, -1)).toBe(-2);

    expect(await div(12, 4)).toBe(3);
    expect(await div(10, 3)).toBeCloseTo(3.33333, 4);
    expect(await div(1, 0)).not.toBeFinite();
    expect(await div(0, 1)).toBe(0);
    expect(await div(0, 0)).toBeNaN();
  });
});
