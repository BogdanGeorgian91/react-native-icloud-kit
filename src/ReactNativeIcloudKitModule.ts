import { NativeModule, requireNativeModule } from 'expo';

import { ReactNativeIcloudKitModuleEvents } from './ReactNativeIcloudKit.types';

declare class ReactNativeIcloudKitModule extends NativeModule<ReactNativeIcloudKitModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ReactNativeIcloudKitModule>('ReactNativeIcloudKit');
