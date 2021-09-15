import path from "path";
import { readFile } from "fs/promises";
import { Bindings, stringOut, OpenFiles, bufferIn } from "../src";
import {
  getOriginPrivateDirectory,
  node,
} from "../../native-file-system-adapter-lite/src/index";

const EOL = "\n";

type Test = Partial<{
  exitCode: number;
  stdin: string;
  stdout: string;
}>;

const tests: (Test & { test: string })[] = [
  // faild
  // { test: "getentropy" },
  // { test: "link" },
  // { test: "stat" },
  // ---
  { test: "cant_dotdot" },
  { test: "clock_getres" },
  { test: "exitcode", exitCode: 120 },
  { test: "fd_prestat_get_refresh" },
  { test: "freopen", stdout: `hello from input2.txt${EOL}` },
  { test: "getrusage" },
  { test: "gettimeofday" },
  { test: "main_args" },
  { test: "notdir" },
  { test: "poll" },
  { test: "preopen_populates" },
  { test: "read_file", stdout: `hello from input.txt${EOL}` },
  {
    test: "read_file_twice",
    stdout: `hello from input.txt${EOL}hello from input.txt${EOL}`,
  },
  { test: "write_file" },
  { test: "stdin", stdin: "hello world", stdout: "hello world" },
  { test: "stdout", stdout: "42" },
  { test: "stdout_with_flush", stdout: `12${EOL}34` },
  { test: "stdout_with_setbuf", stdout: `42` },
  { test: "async-export", stdout: `10 + 3 = 13${EOL}10 / 3 = 3.33${EOL}` },
];

const textEncoder = new TextEncoder();

describe("all", () => {
  test.each(tests)(
    "$test",
    async ({ test, stdin, stdout = "", exitCode = 0 }) => {
      const wasmPath = path.resolve(
        path.join(
          __dirname,
          "..",
          "demo",
          "public",
          "tests",
          "async-wasm",
          `${test}.wasm`
        )
      );
      const module = readFile(wasmPath).then((buf) => WebAssembly.compile(buf));

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

      let actualStdout = "";
      let actualStderr = "";
      const actualExitCode = await new Bindings({
        openFiles: new OpenFiles({
          // @ts-ignore
          "/sandbox": sandbox,
          // @ts-ignore
          "/tmp": tmp,
        }),
        stdin: bufferIn(textEncoder.encode(stdin)),
        stdout: stringOut((text) => (actualStdout += text)),
        stderr: stringOut((text) => (actualStderr += text)),
        args: ["foo", "-bar", "--baz=value"],
        env: {
          NODE_PLATFORM: "win32",
        },
      }).run(await module);
      expect(actualExitCode).toBe(exitCode);
      expect(actualStdout).toBe(stdout);
      expect(actualStderr).toBe("");
    }
  );
});
