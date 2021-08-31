# wasi-fs-access

this repository is folkd from [[GoogleChromeLabs/wasi-fs-access](https://github.com/GoogleChromeLabs/wasi-fs-access.git)] and add modify.

## What

This is a demo shell powered by [WebAssembly](https://webassembly.org/), [WASI](https://wasi.dev/), [Asyncify](https://emscripten.org/docs/porting/asyncify.html) and [File System Access API](https://wicg.github.io/file-system-access/).

You can access the live version here: https://wasi.rreverser.com/

Or watch a video showing some of the features: [![Youtube recording](https://user-images.githubusercontent.com/557590/95856904-b16b2300-0d52-11eb-9726-5ce4f2df7915.png)](https://youtu.be/qRmO-8b4WmE)

## How

It provides [WASI bindings implementation](https://github.com/GoogleChromeLabs/wasi-fs-access/blob/main/src/bindings.ts#LC511:~:text=getWasiImports()%20%7B) that proxies any filesystem requests to a real, host filesystem. This allows apps built in languages like C, C++, Rust and others to be compiled to WebAssembly and work as usual within a browser sandbox, accessing and manipulating files in a "real world".

Since WASI APIs are synchronous by nature, but Web APIs are traditionally asynchronous to avoid blocking the main thread, Asyncify is used to bridge the two types of APIs together. Asyncify is a feature created as part of [Emscripten](https://emscripten.org/) and later extended to work with arbitrary WebAssembly files with the help of a [custom JavaScript wrapper](https://github.com/GoogleChromeLabs/asyncify).

A [Rust port of coreutils with some patches](https://github.com/RReverser/coreutils) was chosen for the demo purposes, but it should be possible to extract and reuse same bindings for any applications compiled for the WebAssembly + WASI target.

Note that some commands in the demo might not work due to either limitations of the WASI itself, limitations of the File System Access API (such as an [absent support for symlinks](https://github.com/WICG/file-system-access/issues/113)), or simply due to hardcoded assumptions about the target system in the used coreutils codebase itself. Most of those limitations can be easily worked around or will be naturally fixed as both APIs develop over time.

### Want to learn more?

Read up a blog post about Asyncify: https://web.dev/asyncify/

Or check out my presentation from the [WebAssembly Live!](https://webassembly.live/) here: https://www.slideshare.net/RReverser/asyncifying-webassembly-for-the-modern-web

And / or the talk: https://youtu.be/pzIJYAbcbf8?t=82
