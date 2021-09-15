import path from "path";
import { readFile } from "fs/promises";
import { Bindings, stringOut, OpenFiles } from "../src";

import {
  getOriginPrivateDirectory,
  node,
} from "../../native-file-system-adapter-lite/src/index";

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
      "/Users/kazu/ghq/github.com/kobakazu0429/wasi-fs-access/demo/public/tests/fixtures/"
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
});
