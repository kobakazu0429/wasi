import { E } from "./constants";

export class SystemError extends Error {
  constructor(public readonly code: E, public readonly ignore = false) {
    super(`E${E[code]}`);
  }
}
