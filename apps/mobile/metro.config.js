const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const root = path.resolve(__dirname, '../..');
const react = path.dirname(require.resolve('react/package.json'));
module.exports = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [root],
  resolver: {
    nodeModulesPaths: [path.join(__dirname, 'node_modules'), path.join(root, 'node_modules')],
    resolveRequest(context, moduleName, platform) {
      if (moduleName === 'react' || moduleName.startsWith('react/')) {
        const target = moduleName === 'react' ? react : path.join(react, moduleName.slice(6));
        return context.resolveRequest(context, target, platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
});
