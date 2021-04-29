module.exports = {
  env: {
    commonjs: true,
    es2021: true,
    node: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {
    'no-empty-pattern': 0,
    'max-len': 0,
    'no-underscore-dangle': 0,
    'no-param-reassign': 0,
    'global-require': 0,
    'no-dynamic-require': 0,
  },
};
