// Expo + npm workspaces:要明確話俾 Metro 聽去邊度搵 @unfoodie/core
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 只監視共用源碼,唔好監視成個 workspace root ——
// 連 node_modules 幾萬個檔案一齊 watch 會撞爆 macOS 嘅
// file descriptor 上限(EMFILE: too many open files)。
// 模組解析靠下面 nodeModulesPaths,唔需要 watch。
config.watchFolders = [path.resolve(workspaceRoot, 'packages')];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// 唔好開 disableHierarchicalLookup —— 嗰個係 pnpm 先要。
// npm workspaces 會將 transitive dependency hoist 上根目錄,
// 關咗階層搜尋就搵唔返(例如 react-native 內部 require 嘅 memoize-one)。

module.exports = config;
