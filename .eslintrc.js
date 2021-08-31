module.exports = /**@type import("eslint").Linter.Config */ ({
  extends: "@kobakazu0429/eslint-config-typescript",
  rules: {
    "@typescript-eslint/member-ordering": "warn",
    "@typescript-eslint/no-empty-function": "warn"
  }
});
