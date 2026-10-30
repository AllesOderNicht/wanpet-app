const path = require('path');
const react = path.dirname(require.resolve('react/package.json'));
module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  testMatch: ['**/__tests__/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/Pods/'],
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native(-.*)?|@react-native(-community)?|@react-navigation|react-freeze)/)'],
  moduleNameMapper: {'^react$': react, '^react/(.*)$': `${react}/$1`},
};
