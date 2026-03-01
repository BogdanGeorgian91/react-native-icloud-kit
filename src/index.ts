// Reexport the native module. On web, it will be resolved to ReactNativeIcloudKitModule.web.ts
// and on native platforms to ReactNativeIcloudKitModule.ts
export { default } from './ReactNativeIcloudKitModule';
export { default as ReactNativeIcloudKitView } from './ReactNativeIcloudKitView';
export * from  './ReactNativeIcloudKit.types';
